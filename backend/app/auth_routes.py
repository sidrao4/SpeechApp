import os
import re
import secrets
from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

from .db import get_connection
from .ratelimit import check_rate_limit
from .security import (
    REFRESH_COOKIE,
    clear_auth_cookies,
    create_access_token,
    get_current_user_id,
    hash_password,
    issue_refresh_token,
    revoke_refresh_token,
    rotate_refresh_token,
    set_auth_cookies,
    verify_password,
)

router = APIRouter(prefix="/api/auth")

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")

# the public origin the browser sees (the Vercel URL). Google redirects back
# here, and Vercel forwards /api/* to this backend
PUBLIC_URL = os.environ.get("PUBLIC_URL", "http://localhost:5173").rstrip("/")

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
google_enabled = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

oauth = OAuth()
if google_enabled:
    oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        # discovery doc: gives Authlib the endpoints and the JWKS it uses to
        # verify the ID token's signature
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile", "code_challenge_method": "S256"},
    )


class Credentials(BaseModel):
    username: str
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def check_username(cls, value: str) -> str:
        value = value.strip()
        if not USERNAME_PATTERN.fullmatch(value):
            raise ValueError("3–32 characters: letters, numbers, _ . -")
        return value


class UserResponse(BaseModel):
    id: int
    username: str


def _auth_rate_limit(request: Request) -> None:
    check_rate_limit(
        request, "auth", max_requests=10, window_seconds=600,
        detail="Too many attempts — try again in a few minutes.",
    )


def _start_session(response: Response, conn, user_id: int) -> None:
    set_auth_cookies(response, create_access_token(user_id), issue_refresh_token(conn, user_id))


@router.get("/providers")
def providers():
    return {"google": google_enabled}


@router.post("/register", response_model=UserResponse, status_code=201, dependencies=[Depends(_auth_rate_limit)])
def register(body: Credentials, response: Response):
    with get_connection() as conn:
        taken = conn.execute(
            "SELECT 1 FROM users WHERE lower(username) = lower(%s)", (body.username,)
        ).fetchone()
        if taken:
            raise HTTPException(status_code=409, detail="That username is taken.")

        user = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (%s, %s) RETURNING id, username",
            (body.username, hash_password(body.password)),
        ).fetchone()
        _start_session(response, conn, user["id"])
        return user


@router.post("/login", response_model=UserResponse, dependencies=[Depends(_auth_rate_limit)])
def login(body: Credentials, response: Response):
    with get_connection() as conn:
        user = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE lower(username) = lower(%s)",
            (body.username,),
        ).fetchone()

        valid, new_hash = verify_password(body.password, user["password_hash"] if user else None)
        if not valid:
            # same message for "no such user" and "wrong password"
            raise HTTPException(status_code=401, detail="Invalid username or password.")

        if new_hash:
            conn.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, user["id"]))

        _start_session(response, conn, user["id"])
        return {"id": user["id"], "username": user["username"]}


@router.post("/refresh", status_code=204)
def refresh(request: Request, response: Response):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not logged in.")

    with get_connection() as conn:
        result = rotate_refresh_token(conn, token)

    if result is None:
        # raising would drop the Set-Cookie headers, so build the 401 by hand
        # to also clear the dead cookies
        failed = Response(status_code=401)
        clear_auth_cookies(failed)
        return failed

    user_id, new_refresh = result
    set_auth_cookies(response, create_access_token(user_id), new_refresh)
    return None


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response):
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        with get_connection() as conn:
            revoke_refresh_token(conn, token)
    clear_auth_cookies(response)
    return None


@router.get("/me", response_model=UserResponse)
def me(user_id: int = Depends(get_current_user_id)):
    with get_connection() as conn:
        user = conn.execute("SELECT id, username FROM users WHERE id = %s", (user_id,)).fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="Not logged in.")
    return user


# ---------- Google sign-in (OpenID Connect, authorization code + PKCE) ----------

def _require_google():
    if not google_enabled:
        raise HTTPException(status_code=503, detail="Google sign-in isn't configured on this server.")


@router.get("/google/login", dependencies=[Depends(_require_google)])
async def google_login(request: Request):
    # Authlib generates the state (CSRF protection for the redirect) and the
    # PKCE code_verifier, stashes both in the signed session cookie, and
    # sends the user to Google with the matching code_challenge
    return await oauth.google.authorize_redirect(request, f"{PUBLIC_URL}/api/auth/google/callback")


def _find_or_create_google_user(google_sub: str, email: str | None) -> int:
    with get_connection() as conn:
        # matched on Google's stable subject id, not email. auto-linking to an
        # existing account by email would let anyone who controls that email
        # at Google take over a password account with the same name
        row = conn.execute("SELECT id FROM users WHERE google_sub = %s", (google_sub,)).fetchone()
        if row:
            return row["id"]

        base = re.sub(r"[^A-Za-z0-9_.-]", "", (email or "user").split("@")[0])[:24] or "user"
        username = base if len(base) >= 3 else f"{base}_user"
        while conn.execute("SELECT 1 FROM users WHERE lower(username) = lower(%s)", (username,)).fetchone():
            username = f"{base}{secrets.randbelow(10000)}"

        return conn.execute(
            "INSERT INTO users (username, google_sub, email) VALUES (%s, %s, %s) RETURNING id",
            (username, google_sub, email),
        ).fetchone()["id"]


def _issue_session_for(user_id: int, response: Response) -> None:
    with get_connection() as conn:
        _start_session(response, conn, user_id)


@router.get("/google/callback", dependencies=[Depends(_require_google)])
async def google_callback(request: Request):
    error_redirect = RedirectResponse(f"{PUBLIC_URL}/?{urlencode({'auth_error': 'google'})}")
    try:
        # checks state against the session, exchanges the code (sending the
        # PKCE verifier), then validates the ID token: signature via Google's
        # JWKS, issuer, audience, expiry and nonce
        token = await oauth.google.authorize_access_token(request)
    except OAuthError:
        return error_redirect

    userinfo = token.get("userinfo")
    if not userinfo or not userinfo.get("sub"):
        return error_redirect

    user_id = await run_in_threadpool(_find_or_create_google_user, userinfo["sub"], userinfo.get("email"))
    response = RedirectResponse(f"{PUBLIC_URL}/")
    await run_in_threadpool(_issue_session_for, user_id, response)
    return response

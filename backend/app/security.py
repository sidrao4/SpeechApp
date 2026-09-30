import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import psycopg
from fastapi import HTTPException, Request, Response
from pwdlib import PasswordHash

ACCESS_TOKEN_TTL = timedelta(minutes=15)
REFRESH_TOKEN_TTL = timedelta(days=30)
ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
JWT_ALGORITHM = "HS256"

# Secure cookies are only sent over HTTPS. browsers treat http://localhost as
# secure too, so this can stay on for local dev; the switch is just an escape
# hatch for odd setups
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() != "false"


def _jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        # refuse to run with a missing or guessable signing key rather than
        # silently falling back to a default anyone could forge tokens with
        raise RuntimeError("JWT_SECRET is not set")
    return secret


# ---------- passwords ----------

# Argon2id with pwdlib's recommended parameters. memory-hard, so GPU
# cracking a leaked hash is expensive
password_hasher = PasswordHash.recommended()

# verified against when the username doesn't exist, so a login for a missing
# user takes as long as one with a wrong password (no timing-based way to
# tell which usernames are registered)
_DUMMY_HASH = password_hasher.hash("timing-equalizer-not-a-real-password")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, stored_hash: str | None) -> tuple[bool, str | None]:
    """Returns (valid, new_hash). new_hash is set when the stored hash used
    older Argon2 parameters and should be upgraded."""
    if stored_hash is None:
        password_hasher.verify(password, _DUMMY_HASH)
        return False, None
    return password_hasher.verify_and_update(password, stored_hash)


# ---------- access tokens (JWT) ----------

def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + ACCESS_TOKEN_TTL, "type": "access"}
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> int | None:
    try:
        # pinning algorithms blocks the "alg: none" / algorithm-swap attacks
        payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    try:
        return int(payload["sub"])
    except (KeyError, ValueError):
        return None


# ---------- refresh tokens (opaque, stored hashed, rotated) ----------

def _hash_token(token: str) -> str:
    # the token is 256 bits of randomness, so a fast hash is enough here (no
    # need for Argon2). a DB leak still doesn't hand out usable tokens
    return hashlib.sha256(token.encode()).hexdigest()


def issue_refresh_token(conn: psycopg.Connection, user_id: int, family_id: uuid.UUID | None = None) -> str:
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (%s, %s, %s, %s)",
        (user_id, _hash_token(token), family_id or uuid.uuid4(), datetime.now(timezone.utc) + REFRESH_TOKEN_TTL),
    )
    return token


def rotate_refresh_token(conn: psycopg.Connection, token: str) -> tuple[int, str] | None:
    """Swaps a valid refresh token for a new one in the same family.
    Returns (user_id, new_token), or None if the token is bad.

    If a token that was already rotated shows up again, someone is replaying
    a stolen copy (or the real user is, after the thief used it first). we
    can't tell which, so the whole family is revoked and both get logged out."""
    token_hash = _hash_token(token)

    # conditional UPDATE so two requests racing with the same token can't
    # both succeed: only one sees revoked_at IS NULL
    row = conn.execute(
        "UPDATE refresh_tokens SET revoked_at = now() "
        "WHERE token_hash = %s AND revoked_at IS NULL AND expires_at > now() "
        "RETURNING user_id, family_id",
        (token_hash,),
    ).fetchone()

    if row is None:
        reused = conn.execute(
            "SELECT family_id FROM refresh_tokens WHERE token_hash = %s AND revoked_at IS NOT NULL",
            (token_hash,),
        ).fetchone()
        if reused is not None:
            revoke_family(conn, reused["family_id"])
        return None

    new_token = issue_refresh_token(conn, row["user_id"], row["family_id"])
    return row["user_id"], new_token


def revoke_family(conn: psycopg.Connection, family_id: uuid.UUID) -> None:
    conn.execute(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = %s AND revoked_at IS NULL",
        (family_id,),
    )


def revoke_refresh_token(conn: psycopg.Connection, token: str) -> None:
    row = conn.execute(
        "SELECT family_id FROM refresh_tokens WHERE token_hash = %s", (_hash_token(token),)
    ).fetchone()
    if row is not None:
        revoke_family(conn, row["family_id"])


# ---------- cookies ----------

def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    # httpOnly: page JavaScript can't read them, so an XSS bug can't steal them.
    # SameSite=Lax: not sent on cross-site POSTs, which covers CSRF.
    # the refresh cookie is scoped to /api/auth so it only travels on the
    # few requests that need it, not every API call
    response.set_cookie(
        ACCESS_COOKIE, access_token, max_age=int(ACCESS_TOKEN_TTL.total_seconds()),
        httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/api",
    )
    response.set_cookie(
        REFRESH_COOKIE, refresh_token, max_age=int(REFRESH_TOKEN_TTL.total_seconds()),
        httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/api/auth",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/api", secure=COOKIE_SECURE, httponly=True, samesite="lax")
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth", secure=COOKIE_SECURE, httponly=True, samesite="lax")


# ---------- dependencies ----------

def get_current_user_id(request: Request) -> int:
    """The only place a request's identity comes from. routes take this as a
    dependency instead of trusting a user_id sent by the client"""
    token = request.cookies.get(ACCESS_COOKIE)
    user_id = decode_access_token(token) if token else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not logged in.")
    return user_id

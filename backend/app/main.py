import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from google import genai
from google.genai import errors as genai_errors
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

from .auth_routes import router as auth_router
from .db import get_connection, init_db
from .ratelimit import check_rate_limit
from .security import COOKIE_SECURE, get_current_user_id

WORDS_PER_MINUTE = 140

# script generation hits a free (but rate limited) api with no login
# needed, so this just caps how much one client can hammer it
GENERATE_LENGTH_TARGETS = {"short": 60, "medium": 150, "long": 300}

# using the -latest alias here, google says not to for prod since it can
# swap versions with only ~2 weeks notice, but for a small project that's
# fine, saves having to update a hardcoded model string by hand. can
# override with an env var if needed
GENERATE_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-lite-latest")


def get_genai_client() -> genai.Client:
    # built lazily per request instead of at import time, so a missing key
    # only breaks this one route instead of the whole app failing to start
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Script generation isn't configured on this server.")
    return genai.Client(api_key=api_key)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)

# no CORS middleware: the browser only ever talks to the frontend's origin,
# and Vercel (or the Vite dev proxy locally) forwards /api/* here, so every
# request is same-origin

# signed cookie that holds the Google OAuth state + PKCE verifier between the
# redirect out and the callback. nothing else goes in it
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SESSION_SECRET") or os.environ["JWT_SECRET"],
    session_cookie="oauth_session",
    max_age=600,
    same_site="lax",
    https_only=COOKIE_SECURE,
)

app.include_router(auth_router)


class ScriptCreateRequest(BaseModel):
    text: str = Field(min_length=1)


class ScriptResponse(BaseModel):
    id: int
    user_id: int
    text: str
    word_count: int
    est_read_time_seconds: int
    created_at: datetime


class SessionCreateRequest(BaseModel):
    script_id: int
    started_at: str
    ended_at: str
    words_completed: int
    total_words: int


class SessionResponse(BaseModel):
    id: int
    script_id: int
    user_id: int
    started_at: str
    ended_at: str
    words_completed: int
    total_words: int


class GenerateScriptRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=500)
    length: Literal["short", "medium", "long"] = "medium"


class GenerateScriptResponse(BaseModel):
    text: str


SCRIPT_COLUMNS = "id, user_id, text, word_count, est_read_time_seconds, created_at"
SESSION_COLUMNS = "id, script_id, user_id, started_at, ended_at, words_completed, total_words"


def _get_owned_script(conn, script_id: int, user_id: int):
    # ownership is part of the WHERE clause, and someone else's script gets
    # the same 404 as a missing one, so ids can't be probed for existence
    row = conn.execute(
        f"SELECT {SCRIPT_COLUMNS} FROM scripts WHERE id = %s AND user_id = %s",
        (script_id, user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="script not found")
    return row


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/scripts", response_model=list[ScriptResponse])
def list_scripts(user_id: int = Depends(get_current_user_id)):
    with get_connection() as conn:
        return conn.execute(
            f"SELECT {SCRIPT_COLUMNS} FROM scripts WHERE user_id = %s ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()


@app.post("/api/scripts", response_model=ScriptResponse, status_code=201)
def create_script(body: ScriptCreateRequest, user_id: int = Depends(get_current_user_id)):
    word_count = len(body.text.split())
    est_read_time_seconds = round(word_count * 60 / WORDS_PER_MINUTE)

    with get_connection() as conn:
        return conn.execute(
            "INSERT INTO scripts (user_id, text, word_count, est_read_time_seconds) "
            f"VALUES (%s, %s, %s, %s) RETURNING {SCRIPT_COLUMNS}",
            (user_id, body.text, word_count, est_read_time_seconds),
        ).fetchone()


@app.get("/api/scripts/{script_id}", response_model=ScriptResponse)
def get_script(script_id: int, user_id: int = Depends(get_current_user_id)):
    with get_connection() as conn:
        return _get_owned_script(conn, script_id, user_id)


@app.post("/api/sessions", response_model=SessionResponse, status_code=201)
def create_session(body: SessionCreateRequest, user_id: int = Depends(get_current_user_id)):
    with get_connection() as conn:
        _get_owned_script(conn, body.script_id, user_id)
        return conn.execute(
            "INSERT INTO sessions "
            "(script_id, user_id, started_at, ended_at, words_completed, total_words) "
            f"VALUES (%s, %s, %s, %s, %s, %s) RETURNING {SESSION_COLUMNS}",
            (
                body.script_id,
                user_id,
                body.started_at,
                body.ended_at,
                body.words_completed,
                body.total_words,
            ),
        ).fetchone()


@app.get("/api/scripts/{script_id}/sessions", response_model=list[SessionResponse])
def list_sessions(script_id: int, user_id: int = Depends(get_current_user_id)):
    with get_connection() as conn:
        _get_owned_script(conn, script_id, user_id)
        return conn.execute(
            f"SELECT {SESSION_COLUMNS} FROM sessions WHERE script_id = %s ORDER BY started_at DESC",
            (script_id,),
        ).fetchall()


@app.post("/api/generate-script", response_model=GenerateScriptResponse)
def generate_script(body: GenerateScriptRequest, request: Request):
    check_rate_limit(
        request, "generate", max_requests=5, window_seconds=600,
        detail="Too many script generations from this connection — try again in a few minutes.",
    )
    client = get_genai_client()

    target_words = GENERATE_LENGTH_TARGETS[body.length]
    prompt_text = (
        "Write a short script meant to be read aloud (not an essay, not "
        f"bullet points) about: {body.prompt}\n\n"
        f"Target length: about {target_words} words. Output only the "
        "script text itself — no title, no preamble, no markdown."
    )
    try:
        response = client.models.generate_content(model=GENERATE_MODEL, contents=prompt_text)
    except genai_errors.APIError as exc:
        raise HTTPException(status_code=502, detail="Script generation failed — try again.") from exc

    text = (response.text or "").strip()
    if not text:
        raise HTTPException(status_code=502, detail="Script generation returned nothing — try again.")
    return {"text": text}

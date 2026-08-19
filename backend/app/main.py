import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import errors as genai_errors
from pydantic import BaseModel, Field

from .db import get_connection, init_db

WORDS_PER_MINUTE = 140

# Script generation calls a (free-tier, but rate-limited) API with no login
# required to use it, so these bound worst-case load from a single abusive
# client rather than relying on auth to gate it at all.
GENERATE_LENGTH_TARGETS = {"short": 60, "medium": 150, "long": 300}
RATE_LIMIT_WINDOW_SECONDS = 600
RATE_LIMIT_MAX_REQUESTS = 5
_rate_limit_state: dict[str, list[float]] = defaultdict(list)

# "-latest" aliases aren't Google's recommendation for production (they can
# swap to a new model version with only ~2 weeks notice), but for a small
# personal project that trade-off is worth not having to track exact model
# version strings by hand as they change. Override via env var if needed.
GENERATE_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-lite-latest")


def get_genai_client() -> genai.Client:
    # Constructed lazily, per-request, rather than at import time — if
    # GEMINI_API_KEY isn't set, only this endpoint should fail, not the
    # entire app on startup (login/scripts/sessions don't need this key).
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Script generation isn't configured on this server.")
    return genai.Client(api_key=api_key)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)

_default_origins = "http://localhost:5173,http://127.0.0.1:5173"
allowed_origins = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", _default_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)


class LoginResponse(BaseModel):
    id: int
    username: str


class ScriptCreateRequest(BaseModel):
    user_id: int
    text: str = Field(min_length=1)


class ScriptResponse(BaseModel):
    id: int
    user_id: int
    text: str
    word_count: int
    est_read_time_seconds: int
    created_at: str


class SessionCreateRequest(BaseModel):
    script_id: int
    user_id: int
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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/login", response_model=LoginResponse)
def login(body: LoginRequest):
    username = body.username.strip()
    if not username:
        raise HTTPException(status_code=422, detail="username cannot be empty")

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, username FROM users WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()
        if row is not None:
            return {"id": row["id"], "username": row["username"]}

        cursor = conn.execute("INSERT INTO users (username) VALUES (?)", (username,))
        conn.commit()
        return {"id": cursor.lastrowid, "username": username}
    finally:
        conn.close()


@app.get("/api/scripts", response_model=list[ScriptResponse])
def list_scripts(user_id: int = Query(...)):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, user_id, text, word_count, est_read_time_seconds, created_at "
            "FROM scripts WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@app.post("/api/scripts", response_model=ScriptResponse, status_code=201)
def create_script(body: ScriptCreateRequest):
    conn = get_connection()
    try:
        user = conn.execute("SELECT id FROM users WHERE id = ?", (body.user_id,)).fetchone()
        if user is None:
            raise HTTPException(status_code=404, detail="user not found")

        word_count = len(body.text.split())
        est_read_time_seconds = round(word_count * 60 / WORDS_PER_MINUTE)

        cursor = conn.execute(
            "INSERT INTO scripts (user_id, text, word_count, est_read_time_seconds) "
            "VALUES (?, ?, ?, ?)",
            (body.user_id, body.text, word_count, est_read_time_seconds),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, user_id, text, word_count, est_read_time_seconds, created_at "
            "FROM scripts WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.get("/api/scripts/{script_id}", response_model=ScriptResponse)
def get_script(script_id: int):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, user_id, text, word_count, est_read_time_seconds, created_at "
            "FROM scripts WHERE id = ?",
            (script_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="script not found")
        return dict(row)
    finally:
        conn.close()


@app.post("/api/sessions", response_model=SessionResponse, status_code=201)
def create_session(body: SessionCreateRequest):
    conn = get_connection()
    try:
        script = conn.execute(
            "SELECT id FROM scripts WHERE id = ?", (body.script_id,)
        ).fetchone()
        if script is None:
            raise HTTPException(status_code=404, detail="script not found")

        cursor = conn.execute(
            "INSERT INTO sessions "
            "(script_id, user_id, started_at, ended_at, words_completed, total_words) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                body.script_id,
                body.user_id,
                body.started_at,
                body.ended_at,
                body.words_completed,
                body.total_words,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, script_id, user_id, started_at, ended_at, words_completed, total_words "
            "FROM sessions WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.get("/api/scripts/{script_id}/sessions", response_model=list[SessionResponse])
def list_sessions(script_id: int):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, script_id, user_id, started_at, ended_at, words_completed, total_words "
            "FROM sessions WHERE script_id = ? ORDER BY started_at DESC",
            (script_id,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(client_ip: str) -> None:
    now = time.time()
    recent = [t for t in _rate_limit_state[client_ip] if now - t < RATE_LIMIT_WINDOW_SECONDS]
    if len(recent) >= RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail="Too many script generations from this connection — try again in a few minutes.",
        )
    recent.append(now)
    _rate_limit_state[client_ip] = recent


@app.post("/api/generate-script", response_model=GenerateScriptResponse)
def generate_script(body: GenerateScriptRequest, request: Request):
    _check_rate_limit(_client_ip(request))
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

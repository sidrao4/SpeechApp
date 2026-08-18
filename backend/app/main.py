import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .db import get_connection, init_db

WORDS_PER_MINUTE = 140


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

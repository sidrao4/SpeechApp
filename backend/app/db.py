import os
import sqlite3
from pathlib import Path

# Falls back to a local file (already .gitignore'd) for local dev. In
# production this must point at a path on a mounted Railway volume — the
# container filesystem otherwise gets wiped on every redeploy/restart.
DATABASE_PATH = Path(os.environ.get("DATABASE_PATH", "./data/speechapp.db"))

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"


def get_connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_connection()
    try:
        conn.executescript(SCHEMA_PATH.read_text())
        conn.commit()
    finally:
        conn.close()

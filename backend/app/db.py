import os
import sqlite3
from pathlib import Path

# falls back to a local file (gitignored) for dev. in prod this needs to
# point at a mounted Railway volume or the db gets wiped on every redeploy
DATABASE_PATH = Path(os.environ.get("DATABASE_PATH", "./data/verbatim.db"))

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

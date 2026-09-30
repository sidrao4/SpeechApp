import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

# Postgres connection string. in prod this is the Neon URL set on Render
# (Render's free tier has no persistent disk, so a local SQLite file would
# get wiped on every restart). for local dev, point it at any Postgres —
# see the README for a one-line docker command
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/verbatim")

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"


def get_connection() -> psycopg.Connection:
    # rows come back as dicts so the route handlers can return them as-is
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(SCHEMA_PATH.read_text())

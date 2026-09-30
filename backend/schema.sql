CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- case-insensitive uniqueness, same behavior as the old COLLATE NOCASE
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));

CREATE TABLE IF NOT EXISTS scripts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  est_read_time_seconds INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scripts_user_id ON scripts(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  script_id BIGINT NOT NULL REFERENCES scripts(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  words_completed INTEGER NOT NULL,
  total_words INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_script_id ON sessions(script_id);

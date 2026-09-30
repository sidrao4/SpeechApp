CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- added with auth. ADD COLUMN IF NOT EXISTS so this also upgrades a
-- database created before these existed. password_hash is null for
-- Google-only accounts; google_sub is Google's stable per-user id
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
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

-- one row per issued refresh token. only the SHA-256 of the token is stored.
-- family_id ties together every token descended from one login, so replaying
-- an already-rotated token can revoke that whole chain
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  family_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);

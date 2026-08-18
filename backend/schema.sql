CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  est_read_time_seconds INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scripts_user_id ON scripts(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id INTEGER NOT NULL REFERENCES scripts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  words_completed INTEGER NOT NULL,
  total_words INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_script_id ON sessions(script_id);

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS theses_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO theses_new (id, user_id, title, text, created_at)
SELECT id, user_id, title, text, created_at
FROM theses;

DROP TABLE theses;
ALTER TABLE theses_new RENAME TO theses;

CREATE INDEX IF NOT EXISTS idx_theses_user ON theses(user_id, created_at DESC);

PRAGMA foreign_keys = ON;

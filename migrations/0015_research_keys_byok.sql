CREATE TABLE IF NOT EXISTS user_research_api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('openalex', 'semantic_scholar')),
  encrypted_key TEXT NOT NULL,
  key_hint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_research_api_keys_user
ON user_research_api_keys(user_id, provider);

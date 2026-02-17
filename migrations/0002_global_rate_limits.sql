CREATE TABLE IF NOT EXISTS global_rate_limits (
  rate_key TEXT PRIMARY KEY,
  next_allowed_at_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

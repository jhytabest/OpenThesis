-- Auth provider transition: prefer Google identities while preserving existing records.
ALTER TABLE auth_identities RENAME TO auth_identities_old;

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'openai')),
  provider_subject TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_subject),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO auth_identities (
  id, user_id, provider, provider_subject, email, created_at, updated_at
)
SELECT id, user_id, provider, provider_subject, email, created_at, updated_at
FROM auth_identities_old
WHERE provider IN ('google', 'openai');

DROP TABLE auth_identities_old;

CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id, provider);

-- BYOK transition: allow multiple providers and per-provider model metadata.
ALTER TABLE user_api_keys RENAME TO user_api_keys_old;

CREATE TABLE IF NOT EXISTS user_api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'openrouter', 'gemini', 'claude')),
  encrypted_key TEXT NOT NULL,
  key_hint TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO user_api_keys (
  id, user_id, provider, encrypted_key, key_hint, model, created_at, updated_at
)
SELECT
  id,
  user_id,
  CASE
    WHEN provider IN ('openai', 'openrouter', 'gemini', 'claude') THEN provider
    ELSE 'openai'
  END,
  encrypted_key,
  key_hint,
  NULL,
  created_at,
  updated_at
FROM user_api_keys_old;

DROP TABLE user_api_keys_old;

CREATE TABLE IF NOT EXISTS user_llm_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  active_provider TEXT NOT NULL CHECK (active_provider IN ('openai', 'openrouter', 'gemini', 'claude')),
  active_model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


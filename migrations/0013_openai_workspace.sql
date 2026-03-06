-- Reset existing user-owned workspace data as part of OpenAI auth cutover.
DELETE FROM users;

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('openai')),
  provider_subject TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_subject),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id, provider);

CREATE TABLE IF NOT EXISTS user_api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('openai')),
  encrypted_key TEXT NOT NULL,
  key_hint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS google_integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  google_account_email TEXT,
  scopes_json TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  token_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_drive_roots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  google_integration_id TEXT NOT NULL,
  root_folder_id TEXT NOT NULL,
  pull_folder_id TEXT NOT NULL,
  push_folder_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES theses(id) ON DELETE CASCADE,
  FOREIGN KEY (google_integration_id) REFERENCES google_integrations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  google_file_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('GOOGLE_DOC','GOOGLE_SHEET','PDF','CSV','XLSX')),
  role TEXT,
  title TEXT,
  mime_type TEXT,
  include_in_runs INTEGER NOT NULL DEFAULT 1 CHECK (include_in_runs IN (0,1)),
  is_designated_thesis_doc INTEGER NOT NULL DEFAULT 0 CHECK (is_designated_thesis_doc IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, google_file_id),
  FOREIGN KEY (project_id) REFERENCES theses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_source_documents_project_updated
ON source_documents(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS document_snapshots (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL,
  revision_ref TEXT NOT NULL,
  checksum TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_document_id) REFERENCES source_documents(id) ON DELETE CASCADE,
  UNIQUE(source_document_id, revision_ref, checksum)
);

CREATE INDEX IF NOT EXISTS idx_document_snapshots_source_created
ON document_snapshots(source_document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sync_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('STARTED','COMPLETED','FAILED')),
  summary_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY (project_id) REFERENCES theses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE runs ADD COLUMN run_type TEXT NOT NULL DEFAULT 'RESEARCH';
ALTER TABLE runs ADD COLUMN context_status TEXT NOT NULL DEFAULT 'CURRENT';
ALTER TABLE runs ADD COLUMN input_snapshot_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_runs_thesis_type_context
ON runs(thesis_id, created_at DESC, run_type, context_status);

CREATE TABLE IF NOT EXISTS run_inputs (
  run_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  PRIMARY KEY (run_id, snapshot_id),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES document_snapshots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS run_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  title TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_artifacts_run_created
ON run_artifacts(run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS run_audit_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_audit_events_run_created
ON run_audit_events(run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS run_doc_comments (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  section_label TEXT NOT NULL,
  google_comment_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('POSTED','FAILED')),
  error TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (source_document_id) REFERENCES source_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_doc_comments_run_created
ON run_doc_comments(run_id, created_at DESC);

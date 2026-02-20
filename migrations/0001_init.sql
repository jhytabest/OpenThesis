CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  google_sub TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS theses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_theses_user ON theses(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thesis_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED')),
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (thesis_id) REFERENCES theses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status, created_at ASC);

CREATE TABLE IF NOT EXISTS run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  attempt INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT,
  payload_json TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  UNIQUE(run_id, step_name, attempt)
);

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  openalex_id TEXT NOT NULL UNIQUE,
  semantic_scholar_id TEXT,
  doi TEXT,
  title TEXT NOT NULL,
  abstract TEXT,
  year INTEGER,
  citation_count INTEGER,
  fields_of_study_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_papers_semantic ON papers(semantic_scholar_id);
CREATE INDEX IF NOT EXISTS idx_papers_doi ON papers(doi);

CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY,
  openalex_id TEXT,
  name TEXT NOT NULL,
  orcid TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_authors_openalex_unique ON authors(openalex_id) WHERE openalex_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_authors_name ON authors(name);

CREATE TABLE IF NOT EXISTS paper_authors (
  paper_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_position INTEGER NOT NULL,
  PRIMARY KEY (paper_id, author_id),
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS run_papers (
  run_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  lexical_score REAL NOT NULL,
  graph_score REAL NOT NULL,
  citation_score REAL NOT NULL,
  total_score REAL NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('FOUNDATIONAL','DEPTH','BACKGROUND')),
  PRIMARY KEY (run_id, paper_id),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  src_paper_id TEXT NOT NULL,
  dst_paper_id TEXT NOT NULL,
  edge_type TEXT NOT NULL CHECK (edge_type IN ('REFERENCE','CITATION','SHARED_AUTHOR')),
  weight REAL NOT NULL,
  evidence_json TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (src_paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  FOREIGN KEY (dst_paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  UNIQUE(run_id, src_paper_id, dst_paper_id, edge_type)
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  source TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_evidence_run_entity ON evidence(run_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS paper_access (
  paper_id TEXT PRIMARY KEY,
  pdf_url TEXT,
  oa_status TEXT,
  license TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

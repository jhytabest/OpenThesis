CREATE TABLE IF NOT EXISTS project_chats (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES theses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_chats_project ON project_chats(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_chats_user ON project_chats(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (chat_id) REFERENCES project_chats(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES theses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON chat_messages(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_memory_docs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('auto', 'manual', 'system')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES theses(id) ON DELETE CASCADE,
  UNIQUE(project_id, doc_key)
);

CREATE INDEX IF NOT EXISTS idx_project_memory_docs_project ON project_memory_docs(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_papers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('pipeline', 'manual')),
  paper_id TEXT,
  openalex_id TEXT,
  semantic_scholar_id TEXT,
  doi TEXT,
  title TEXT NOT NULL,
  abstract TEXT,
  year INTEGER,
  citation_count INTEGER,
  fields_of_study_json TEXT NOT NULL DEFAULT '[]',
  score_lexical REAL,
  score_graph REAL,
  score_citation REAL,
  score_total REAL,
  tier TEXT CHECK (tier IN ('FOUNDATIONAL', 'DEPTH', 'BACKGROUND') OR tier IS NULL),
  pdf_url TEXT,
  oa_status TEXT,
  license TEXT,
  bookmarked INTEGER NOT NULL DEFAULT 0 CHECK (bookmarked IN (0, 1)),
  in_reading_list INTEGER NOT NULL DEFAULT 0 CHECK (in_reading_list IN (0, 1)),
  tags_json TEXT NOT NULL DEFAULT '[]',
  note_text TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES theses(id) ON DELETE CASCADE,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_papers_project_paper_unique
ON project_papers(project_id, paper_id);

CREATE INDEX IF NOT EXISTS idx_project_papers_project ON project_papers(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_papers_project_score ON project_papers(project_id, score_total DESC);
CREATE INDEX IF NOT EXISTS idx_project_papers_project_reading ON project_papers(project_id, in_reading_list, bookmarked);

CREATE TABLE IF NOT EXISTS project_paper_comments (
  id TEXT PRIMARY KEY,
  project_paper_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_paper_id) REFERENCES project_papers(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES theses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_paper_comments_paper ON project_paper_comments(project_paper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_paper_comments_project ON project_paper_comments(project_id, created_at DESC);

WITH ranked_run_papers AS (
  SELECT
    r.thesis_id AS project_id,
    p.id AS paper_id,
    p.openalex_id,
    p.semantic_scholar_id,
    p.doi,
    p.title,
    p.abstract,
    p.year,
    p.citation_count,
    p.fields_of_study_json,
    rp.lexical_score,
    rp.graph_score,
    rp.citation_score,
    rp.total_score,
    rp.tier,
    pa.pdf_url,
    pa.oa_status,
    pa.license,
    COALESCE(r.updated_at, r.created_at) AS recency,
    ROW_NUMBER() OVER (
      PARTITION BY r.thesis_id, p.id
      ORDER BY rp.total_score DESC, COALESCE(r.updated_at, r.created_at) DESC
    ) AS rn
  FROM runs r
  INNER JOIN run_papers rp ON rp.run_id = r.id
  INNER JOIN papers p ON p.id = rp.paper_id
  LEFT JOIN paper_access pa ON pa.paper_id = p.id
)
INSERT INTO project_papers (
  id,
  project_id,
  source,
  paper_id,
  openalex_id,
  semantic_scholar_id,
  doi,
  title,
  abstract,
  year,
  citation_count,
  fields_of_study_json,
  score_lexical,
  score_graph,
  score_citation,
  score_total,
  tier,
  pdf_url,
  oa_status,
  license,
  bookmarked,
  in_reading_list,
  tags_json,
  note_text,
  is_deleted,
  created_at,
  updated_at
)
SELECT
  'pp_' || lower(hex(randomblob(16))),
  ranked.project_id,
  'pipeline',
  ranked.paper_id,
  ranked.openalex_id,
  ranked.semantic_scholar_id,
  ranked.doi,
  ranked.title,
  ranked.abstract,
  ranked.year,
  ranked.citation_count,
  ranked.fields_of_study_json,
  ranked.lexical_score,
  ranked.graph_score,
  ranked.citation_score,
  ranked.total_score,
  ranked.tier,
  ranked.pdf_url,
  ranked.oa_status,
  ranked.license,
  0,
  0,
  '[]',
  NULL,
  0,
  ranked.recency,
  ranked.recency
FROM ranked_run_papers ranked
WHERE ranked.rn = 1
  AND NOT EXISTS (
    SELECT 1
    FROM project_papers existing
    WHERE existing.project_id = ranked.project_id
      AND existing.paper_id = ranked.paper_id
  );

WITH latest_thesis_summary AS (
  SELECT
    r.thesis_id AS project_id,
    json_extract(e.detail_json, '$.thesis_summary') AS thesis_summary,
    e.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY r.thesis_id
      ORDER BY e.created_at DESC
    ) AS rn
  FROM evidence e
  INNER JOIN runs r ON r.id = e.run_id
  WHERE e.source = 'openai.thesis_summary'
)
INSERT INTO project_memory_docs (
  id,
  project_id,
  doc_key,
  title,
  content,
  source,
  created_at,
  updated_at
)
SELECT
  'mem_' || lower(hex(randomblob(16))),
  summary.project_id,
  'thesis_summary',
  'Thesis summary',
  CAST(summary.thesis_summary AS TEXT),
  'system',
  summary.created_at,
  summary.created_at
FROM latest_thesis_summary summary
WHERE summary.rn = 1
  AND CAST(summary.thesis_summary AS TEXT) IS NOT NULL
  AND trim(CAST(summary.thesis_summary AS TEXT)) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM project_memory_docs existing
    WHERE existing.project_id = summary.project_id
      AND existing.doc_key = 'thesis_summary'
  );

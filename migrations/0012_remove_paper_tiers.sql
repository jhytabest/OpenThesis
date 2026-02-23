PRAGMA foreign_keys=OFF;

DROP TRIGGER IF EXISTS trg_project_papers_stats_insert;
DROP TRIGGER IF EXISTS trg_project_papers_stats_delete;
DROP TRIGGER IF EXISTS trg_project_papers_stats_update;
DROP TRIGGER IF EXISTS trg_project_chats_stats_insert;
DROP TRIGGER IF EXISTS trg_project_chats_stats_delete;
DROP TRIGGER IF EXISTS trg_project_chats_stats_update_project;
DROP TRIGGER IF EXISTS trg_project_stats_cleanup;
DROP TRIGGER IF EXISTS trg_project_paper_comment_count_insert;
DROP TRIGGER IF EXISTS trg_project_paper_comment_count_delete;
DROP TRIGGER IF EXISTS trg_project_paper_comment_count_move;

CREATE TABLE project_stats_new (
  project_id TEXT PRIMARY KEY,
  paper_count INTEGER NOT NULL DEFAULT 0,
  reading_count INTEGER NOT NULL DEFAULT 0,
  bookmarked_count INTEGER NOT NULL DEFAULT 0,
  open_access_count INTEGER NOT NULL DEFAULT 0,
  chat_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES theses(id) ON DELETE CASCADE
);

INSERT INTO project_stats_new (
  project_id,
  paper_count,
  reading_count,
  bookmarked_count,
  open_access_count,
  chat_count,
  updated_at
)
SELECT
  project_id,
  paper_count,
  reading_count,
  bookmarked_count,
  open_access_count,
  chat_count,
  updated_at
FROM project_stats;

DROP TABLE project_stats;
ALTER TABLE project_stats_new RENAME TO project_stats;

CREATE TABLE run_papers_new (
  run_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  lexical_score REAL NOT NULL,
  graph_score REAL NOT NULL,
  citation_score REAL NOT NULL,
  total_score REAL NOT NULL,
  PRIMARY KEY (run_id, paper_id),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

INSERT INTO run_papers_new (
  run_id,
  paper_id,
  lexical_score,
  graph_score,
  citation_score,
  total_score
)
SELECT
  run_id,
  paper_id,
  lexical_score,
  graph_score,
  citation_score,
  total_score
FROM run_papers;

DROP TABLE run_papers;
ALTER TABLE run_papers_new RENAME TO run_papers;

CREATE TABLE project_papers_new (
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
  pdf_url TEXT,
  oa_status TEXT,
  license TEXT,
  bookmarked INTEGER NOT NULL DEFAULT 0 CHECK (bookmarked IN (0, 1)),
  in_reading_list INTEGER NOT NULL DEFAULT 0 CHECK (in_reading_list IN (0, 1)),
  tags_json TEXT NOT NULL DEFAULT '[]',
  note_text TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES theses(id) ON DELETE CASCADE,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE SET NULL
);

INSERT INTO project_papers_new (
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
  pdf_url,
  oa_status,
  license,
  bookmarked,
  in_reading_list,
  tags_json,
  note_text,
  is_deleted,
  comment_count,
  created_at,
  updated_at
)
SELECT
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
  pdf_url,
  oa_status,
  license,
  bookmarked,
  in_reading_list,
  tags_json,
  note_text,
  is_deleted,
  comment_count,
  created_at,
  updated_at
FROM project_papers;

DROP TABLE project_papers;
ALTER TABLE project_papers_new RENAME TO project_papers;

CREATE UNIQUE INDEX idx_project_papers_project_paper_unique
ON project_papers(project_id, paper_id);

CREATE INDEX idx_project_papers_project
ON project_papers(project_id, updated_at DESC);

CREATE INDEX idx_project_papers_project_score
ON project_papers(project_id, score_total DESC);

CREATE INDEX idx_project_papers_project_reading
ON project_papers(project_id, in_reading_list, bookmarked);

CREATE INDEX idx_project_papers_project_deleted
ON project_papers(project_id, is_deleted);

CREATE INDEX idx_project_papers_project_deleted_reading
ON project_papers(project_id, is_deleted, in_reading_list, bookmarked);

CREATE INDEX idx_project_papers_project_deleted_created
ON project_papers(project_id, is_deleted, created_at DESC);

CREATE INDEX idx_project_papers_project_deleted_citations
ON project_papers(project_id, is_deleted, citation_count DESC, updated_at DESC);

CREATE INDEX idx_project_papers_project_deleted_score
ON project_papers(project_id, is_deleted, score_total DESC, citation_count DESC, updated_at DESC);

CREATE TRIGGER trg_project_paper_comment_count_insert
AFTER INSERT ON project_paper_comments
BEGIN
  UPDATE project_papers
  SET comment_count = comment_count + 1
  WHERE id = NEW.project_paper_id;
END;

CREATE TRIGGER trg_project_paper_comment_count_delete
AFTER DELETE ON project_paper_comments
BEGIN
  UPDATE project_papers
  SET comment_count = MAX(0, comment_count - 1)
  WHERE id = OLD.project_paper_id;
END;

CREATE TRIGGER trg_project_paper_comment_count_move
AFTER UPDATE OF project_paper_id ON project_paper_comments
WHEN OLD.project_paper_id <> NEW.project_paper_id
BEGIN
  UPDATE project_papers
  SET comment_count = MAX(0, comment_count - 1)
  WHERE id = OLD.project_paper_id;

  UPDATE project_papers
  SET comment_count = comment_count + 1
  WHERE id = NEW.project_paper_id;
END;

CREATE TRIGGER trg_project_papers_stats_insert
AFTER INSERT ON project_papers
BEGIN
  INSERT OR IGNORE INTO project_stats (project_id, updated_at)
  VALUES (NEW.project_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  UPDATE project_stats
  SET
    paper_count = paper_count + CASE WHEN NEW.is_deleted = 0 THEN 1 ELSE 0 END,
    reading_count = reading_count + CASE WHEN NEW.is_deleted = 0 AND NEW.in_reading_list = 1 THEN 1 ELSE 0 END,
    bookmarked_count = bookmarked_count + CASE WHEN NEW.is_deleted = 0 AND NEW.bookmarked = 1 THEN 1 ELSE 0 END,
    open_access_count = open_access_count + CASE
      WHEN NEW.is_deleted = 0
        AND (NEW.pdf_url IS NOT NULL OR (NEW.oa_status IS NOT NULL AND trim(NEW.oa_status) <> ''))
      THEN 1
      ELSE 0
    END,
    updated_at = COALESCE(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE project_id = NEW.project_id;
END;

CREATE TRIGGER trg_project_papers_stats_delete
AFTER DELETE ON project_papers
BEGIN
  INSERT OR IGNORE INTO project_stats (project_id, updated_at)
  VALUES (OLD.project_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  UPDATE project_stats
  SET
    paper_count = MAX(0, paper_count - CASE WHEN OLD.is_deleted = 0 THEN 1 ELSE 0 END),
    reading_count = MAX(0, reading_count - CASE WHEN OLD.is_deleted = 0 AND OLD.in_reading_list = 1 THEN 1 ELSE 0 END),
    bookmarked_count = MAX(0, bookmarked_count - CASE WHEN OLD.is_deleted = 0 AND OLD.bookmarked = 1 THEN 1 ELSE 0 END),
    open_access_count = MAX(0, open_access_count - CASE
      WHEN OLD.is_deleted = 0
        AND (OLD.pdf_url IS NOT NULL OR (OLD.oa_status IS NOT NULL AND trim(OLD.oa_status) <> ''))
      THEN 1
      ELSE 0
    END),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER trg_project_papers_stats_update
AFTER UPDATE ON project_papers
BEGIN
  INSERT OR IGNORE INTO project_stats (project_id, updated_at)
  VALUES (OLD.project_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  INSERT OR IGNORE INTO project_stats (project_id, updated_at)
  VALUES (NEW.project_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  UPDATE project_stats
  SET
    paper_count = MAX(0, paper_count - CASE WHEN OLD.is_deleted = 0 THEN 1 ELSE 0 END),
    reading_count = MAX(0, reading_count - CASE WHEN OLD.is_deleted = 0 AND OLD.in_reading_list = 1 THEN 1 ELSE 0 END),
    bookmarked_count = MAX(0, bookmarked_count - CASE WHEN OLD.is_deleted = 0 AND OLD.bookmarked = 1 THEN 1 ELSE 0 END),
    open_access_count = MAX(0, open_access_count - CASE
      WHEN OLD.is_deleted = 0
        AND (OLD.pdf_url IS NOT NULL OR (OLD.oa_status IS NOT NULL AND trim(OLD.oa_status) <> ''))
      THEN 1
      ELSE 0
    END),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE project_id = OLD.project_id;

  UPDATE project_stats
  SET
    paper_count = paper_count + CASE WHEN NEW.is_deleted = 0 THEN 1 ELSE 0 END,
    reading_count = reading_count + CASE WHEN NEW.is_deleted = 0 AND NEW.in_reading_list = 1 THEN 1 ELSE 0 END,
    bookmarked_count = bookmarked_count + CASE WHEN NEW.is_deleted = 0 AND NEW.bookmarked = 1 THEN 1 ELSE 0 END,
    open_access_count = open_access_count + CASE
      WHEN NEW.is_deleted = 0
        AND (NEW.pdf_url IS NOT NULL OR (NEW.oa_status IS NOT NULL AND trim(NEW.oa_status) <> ''))
      THEN 1
      ELSE 0
    END,
    updated_at = COALESCE(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE project_id = NEW.project_id;
END;

CREATE TRIGGER trg_project_chats_stats_insert
AFTER INSERT ON project_chats
BEGIN
  INSERT OR IGNORE INTO project_stats (project_id, updated_at)
  VALUES (NEW.project_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  UPDATE project_stats
  SET
    chat_count = chat_count + 1,
    updated_at = COALESCE(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE project_id = NEW.project_id;
END;

CREATE TRIGGER trg_project_chats_stats_delete
AFTER DELETE ON project_chats
BEGIN
  INSERT OR IGNORE INTO project_stats (project_id, updated_at)
  VALUES (OLD.project_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  UPDATE project_stats
  SET
    chat_count = MAX(0, chat_count - 1),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER trg_project_chats_stats_update_project
AFTER UPDATE OF project_id ON project_chats
BEGIN
  INSERT OR IGNORE INTO project_stats (project_id, updated_at)
  VALUES (OLD.project_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  INSERT OR IGNORE INTO project_stats (project_id, updated_at)
  VALUES (NEW.project_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  UPDATE project_stats
  SET
    chat_count = MAX(0, chat_count - 1),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE project_id = OLD.project_id;

  UPDATE project_stats
  SET
    chat_count = chat_count + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE project_id = NEW.project_id;
END;

CREATE TRIGGER trg_project_stats_cleanup
AFTER DELETE ON theses
BEGIN
  DELETE FROM project_stats WHERE project_id = OLD.id;
END;

PRAGMA foreign_keys=ON;

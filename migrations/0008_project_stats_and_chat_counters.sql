CREATE TABLE IF NOT EXISTS project_stats (
  project_id TEXT PRIMARY KEY,
  paper_count INTEGER NOT NULL DEFAULT 0,
  reading_count INTEGER NOT NULL DEFAULT 0,
  bookmarked_count INTEGER NOT NULL DEFAULT 0,
  foundational_count INTEGER NOT NULL DEFAULT 0,
  depth_count INTEGER NOT NULL DEFAULT 0,
  background_count INTEGER NOT NULL DEFAULT 0,
  open_access_count INTEGER NOT NULL DEFAULT 0,
  chat_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES theses(id) ON DELETE CASCADE
);

ALTER TABLE project_chats ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_chats ADD COLUMN last_message_at TEXT;

UPDATE project_chats
SET
  message_count = COALESCE(
    (SELECT COUNT(*) FROM chat_messages m WHERE m.chat_id = project_chats.id),
    0
  ),
  last_message_at = (
    SELECT MAX(m.created_at)
    FROM chat_messages m
    WHERE m.chat_id = project_chats.id
  );

CREATE INDEX IF NOT EXISTS idx_project_chats_project_user_last_msg
ON project_chats(project_id, user_id, last_message_at DESC, updated_at DESC);

INSERT INTO project_stats (
  project_id,
  paper_count,
  reading_count,
  bookmarked_count,
  foundational_count,
  depth_count,
  background_count,
  open_access_count,
  chat_count,
  updated_at
)
SELECT
  t.id AS project_id,
  COALESCE(pp.paper_count, 0) AS paper_count,
  COALESCE(pp.reading_count, 0) AS reading_count,
  COALESCE(pp.bookmarked_count, 0) AS bookmarked_count,
  COALESCE(pp.foundational_count, 0) AS foundational_count,
  COALESCE(pp.depth_count, 0) AS depth_count,
  COALESCE(pp.background_count, 0) AS background_count,
  COALESCE(pp.open_access_count, 0) AS open_access_count,
  COALESCE(pc.chat_count, 0) AS chat_count,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS updated_at
FROM theses t
LEFT JOIN (
  SELECT
    project_id,
    SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) AS paper_count,
    SUM(CASE WHEN is_deleted = 0 AND in_reading_list = 1 THEN 1 ELSE 0 END) AS reading_count,
    SUM(CASE WHEN is_deleted = 0 AND bookmarked = 1 THEN 1 ELSE 0 END) AS bookmarked_count,
    SUM(CASE WHEN is_deleted = 0 AND tier = 'FOUNDATIONAL' THEN 1 ELSE 0 END) AS foundational_count,
    SUM(CASE WHEN is_deleted = 0 AND tier = 'DEPTH' THEN 1 ELSE 0 END) AS depth_count,
    SUM(CASE WHEN is_deleted = 0 AND tier = 'BACKGROUND' THEN 1 ELSE 0 END) AS background_count,
    SUM(
      CASE
        WHEN is_deleted = 0
          AND (pdf_url IS NOT NULL OR (oa_status IS NOT NULL AND trim(oa_status) <> ''))
        THEN 1
        ELSE 0
      END
    ) AS open_access_count
  FROM project_papers
  GROUP BY project_id
) pp ON pp.project_id = t.id
LEFT JOIN (
  SELECT project_id, COUNT(*) AS chat_count
  FROM project_chats
  GROUP BY project_id
) pc ON pc.project_id = t.id
ON CONFLICT(project_id) DO UPDATE SET
  paper_count = excluded.paper_count,
  reading_count = excluded.reading_count,
  bookmarked_count = excluded.bookmarked_count,
  foundational_count = excluded.foundational_count,
  depth_count = excluded.depth_count,
  background_count = excluded.background_count,
  open_access_count = excluded.open_access_count,
  chat_count = excluded.chat_count,
  updated_at = excluded.updated_at;

CREATE TRIGGER IF NOT EXISTS trg_project_papers_stats_insert
AFTER INSERT ON project_papers
BEGIN
  INSERT OR IGNORE INTO project_stats (project_id, updated_at)
  VALUES (NEW.project_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  UPDATE project_stats
  SET
    paper_count = paper_count + CASE WHEN NEW.is_deleted = 0 THEN 1 ELSE 0 END,
    reading_count = reading_count + CASE WHEN NEW.is_deleted = 0 AND NEW.in_reading_list = 1 THEN 1 ELSE 0 END,
    bookmarked_count = bookmarked_count + CASE WHEN NEW.is_deleted = 0 AND NEW.bookmarked = 1 THEN 1 ELSE 0 END,
    foundational_count = foundational_count + CASE WHEN NEW.is_deleted = 0 AND NEW.tier = 'FOUNDATIONAL' THEN 1 ELSE 0 END,
    depth_count = depth_count + CASE WHEN NEW.is_deleted = 0 AND NEW.tier = 'DEPTH' THEN 1 ELSE 0 END,
    background_count = background_count + CASE WHEN NEW.is_deleted = 0 AND NEW.tier = 'BACKGROUND' THEN 1 ELSE 0 END,
    open_access_count = open_access_count + CASE
      WHEN NEW.is_deleted = 0
        AND (NEW.pdf_url IS NOT NULL OR (NEW.oa_status IS NOT NULL AND trim(NEW.oa_status) <> ''))
      THEN 1
      ELSE 0
    END,
    updated_at = COALESCE(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE project_id = NEW.project_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_project_papers_stats_delete
AFTER DELETE ON project_papers
BEGIN
  INSERT OR IGNORE INTO project_stats (project_id, updated_at)
  VALUES (OLD.project_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  UPDATE project_stats
  SET
    paper_count = MAX(0, paper_count - CASE WHEN OLD.is_deleted = 0 THEN 1 ELSE 0 END),
    reading_count = MAX(0, reading_count - CASE WHEN OLD.is_deleted = 0 AND OLD.in_reading_list = 1 THEN 1 ELSE 0 END),
    bookmarked_count = MAX(0, bookmarked_count - CASE WHEN OLD.is_deleted = 0 AND OLD.bookmarked = 1 THEN 1 ELSE 0 END),
    foundational_count = MAX(0, foundational_count - CASE WHEN OLD.is_deleted = 0 AND OLD.tier = 'FOUNDATIONAL' THEN 1 ELSE 0 END),
    depth_count = MAX(0, depth_count - CASE WHEN OLD.is_deleted = 0 AND OLD.tier = 'DEPTH' THEN 1 ELSE 0 END),
    background_count = MAX(0, background_count - CASE WHEN OLD.is_deleted = 0 AND OLD.tier = 'BACKGROUND' THEN 1 ELSE 0 END),
    open_access_count = MAX(0, open_access_count - CASE
      WHEN OLD.is_deleted = 0
        AND (OLD.pdf_url IS NOT NULL OR (OLD.oa_status IS NOT NULL AND trim(OLD.oa_status) <> ''))
      THEN 1
      ELSE 0
    END),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_project_papers_stats_update
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
    foundational_count = MAX(0, foundational_count - CASE WHEN OLD.is_deleted = 0 AND OLD.tier = 'FOUNDATIONAL' THEN 1 ELSE 0 END),
    depth_count = MAX(0, depth_count - CASE WHEN OLD.is_deleted = 0 AND OLD.tier = 'DEPTH' THEN 1 ELSE 0 END),
    background_count = MAX(0, background_count - CASE WHEN OLD.is_deleted = 0 AND OLD.tier = 'BACKGROUND' THEN 1 ELSE 0 END),
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
    foundational_count = foundational_count + CASE WHEN NEW.is_deleted = 0 AND NEW.tier = 'FOUNDATIONAL' THEN 1 ELSE 0 END,
    depth_count = depth_count + CASE WHEN NEW.is_deleted = 0 AND NEW.tier = 'DEPTH' THEN 1 ELSE 0 END,
    background_count = background_count + CASE WHEN NEW.is_deleted = 0 AND NEW.tier = 'BACKGROUND' THEN 1 ELSE 0 END,
    open_access_count = open_access_count + CASE
      WHEN NEW.is_deleted = 0
        AND (NEW.pdf_url IS NOT NULL OR (NEW.oa_status IS NOT NULL AND trim(NEW.oa_status) <> ''))
      THEN 1
      ELSE 0
    END,
    updated_at = COALESCE(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE project_id = NEW.project_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_project_chats_stats_insert
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

CREATE TRIGGER IF NOT EXISTS trg_project_chats_stats_delete
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

CREATE TRIGGER IF NOT EXISTS trg_project_chats_stats_update_project
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

CREATE TRIGGER IF NOT EXISTS trg_project_stats_cleanup
AFTER DELETE ON theses
BEGIN
  DELETE FROM project_stats WHERE project_id = OLD.id;
END;

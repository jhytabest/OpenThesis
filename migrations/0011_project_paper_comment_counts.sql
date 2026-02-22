ALTER TABLE project_papers
ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0;

UPDATE project_papers
SET comment_count = COALESCE(
  (
    SELECT COUNT(*)
    FROM project_paper_comments c
    WHERE c.project_paper_id = project_papers.id
  ),
  0
);

CREATE TRIGGER IF NOT EXISTS trg_project_paper_comment_count_insert
AFTER INSERT ON project_paper_comments
BEGIN
  UPDATE project_papers
  SET comment_count = comment_count + 1
  WHERE id = NEW.project_paper_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_project_paper_comment_count_delete
AFTER DELETE ON project_paper_comments
BEGIN
  UPDATE project_papers
  SET comment_count = MAX(0, comment_count - 1)
  WHERE id = OLD.project_paper_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_project_paper_comment_count_move
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

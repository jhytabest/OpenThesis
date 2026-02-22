CREATE INDEX IF NOT EXISTS idx_project_papers_project_deleted
ON project_papers(project_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_project_papers_project_deleted_reading
ON project_papers(project_id, is_deleted, in_reading_list, bookmarked);

CREATE INDEX IF NOT EXISTS idx_project_papers_project_deleted_created
ON project_papers(project_id, is_deleted, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_papers_project_deleted_citations
ON project_papers(project_id, is_deleted, citation_count DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_papers_project_deleted_score
ON project_papers(project_id, is_deleted, score_total DESC, citation_count DESC, updated_at DESC);

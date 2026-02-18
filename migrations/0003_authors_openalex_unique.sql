DROP INDEX IF EXISTS idx_authors_openalex_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_authors_openalex_unique
ON authors(openalex_id);

CREATE TABLE IF NOT EXISTS paper_citations (
  paper_id TEXT NOT NULL,
  cited_openalex_id TEXT NOT NULL,
  PRIMARY KEY (paper_id, cited_openalex_id),
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paper_citations_cited_openalex_id
ON paper_citations(cited_openalex_id);

DROP TABLE IF EXISTS edges;

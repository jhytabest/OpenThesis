import type { RelevanceTier, RunStatus } from "../types.js";
import { all, first, nowIso, run } from "./base.js";

export const papersRepo = {
  async upsertPaper(db: D1Database, input: {
    openalexId: string;
    semanticScholarId?: string;
    doi?: string;
    title: string;
    abstract?: string;
    year?: number;
    citationCount?: number;
    fieldsOfStudy: string[];
  }): Promise<{ id: string }> {
    await run(
      db,
      `INSERT INTO papers (
         id, openalex_id, semantic_scholar_id, doi, title, abstract, year, citation_count, fields_of_study_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(openalex_id) DO UPDATE SET
         semantic_scholar_id=COALESCE(excluded.semantic_scholar_id, papers.semantic_scholar_id),
         doi=COALESCE(excluded.doi, papers.doi),
         title=excluded.title,
         abstract=COALESCE(excluded.abstract, papers.abstract),
         year=COALESCE(excluded.year, papers.year),
         citation_count=COALESCE(excluded.citation_count, papers.citation_count),
         fields_of_study_json=excluded.fields_of_study_json,
         updated_at=excluded.updated_at`,
      crypto.randomUUID(),
      input.openalexId,
      input.semanticScholarId ?? null,
      input.doi ?? null,
      input.title,
      input.abstract ?? null,
      input.year ?? null,
      input.citationCount ?? null,
      JSON.stringify(input.fieldsOfStudy),
      nowIso(),
      nowIso()
    );

    const record = await first<{ id: string }>(
      db,
      `SELECT id FROM papers WHERE openalex_id = ?`,
      input.openalexId
    );
    if (!record) {
      throw new Error("Failed to load upserted paper");
    }
    return record;
  },

  async upsertAuthor(db: D1Database, input: {
    openalexId?: string;
    name: string;
    orcid?: string;
  }): Promise<{ id: string }> {
    if (input.openalexId) {
      await run(
        db,
        `INSERT INTO authors (id, openalex_id, name, orcid, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(openalex_id) DO UPDATE SET
           name = excluded.name,
           orcid = COALESCE(excluded.orcid, authors.orcid)`,
        crypto.randomUUID(),
        input.openalexId,
        input.name,
        input.orcid ?? null,
        nowIso()
      );

      const record = await first<{ id: string }>(
        db,
        `SELECT id FROM authors WHERE openalex_id = ?`,
        input.openalexId
      );
      if (!record) {
        throw new Error("Failed to load upserted author");
      }
      return record;
    }

    const existing = await first<{ id: string }>(
      db,
      `SELECT id FROM authors WHERE openalex_id IS NULL AND name = ?`,
      input.name
    );
    if (existing) {
      return existing;
    }

    const id = crypto.randomUUID();
    await run(
      db,
      `INSERT INTO authors (id, name, orcid, created_at) VALUES (?, ?, ?, ?)`,
      id,
      input.name,
      input.orcid ?? null,
      nowIso()
    );
    return { id };
  },

  async linkPaperAuthor(db: D1Database, input: {
    paperId: string;
    authorId: string;
    authorPosition: number;
  }): Promise<void> {
    await run(
      db,
      `INSERT INTO paper_authors (paper_id, author_id, author_position)
       VALUES (?, ?, ?)
       ON CONFLICT(paper_id, author_id) DO UPDATE SET
       author_position = excluded.author_position`,
      input.paperId,
      input.authorId,
      input.authorPosition
    );
  },

  async replacePaperCitations(db: D1Database, input: {
    paperId: string;
    citedOpenalexIds: string[];
  }): Promise<void> {
    await run(db, `DELETE FROM paper_citations WHERE paper_id = ?`, input.paperId);

    const dedupedIds = [...new Set(input.citedOpenalexIds.filter(Boolean))];
    for (const citedOpenalexId of dedupedIds) {
      await run(
        db,
        `INSERT INTO paper_citations (paper_id, cited_openalex_id)
         VALUES (?, ?)`,
        input.paperId,
        citedOpenalexId
      );
    }
  },

  async upsertRunPaper(db: D1Database, input: {
    runId: string;
    paperId: string;
    lexicalScore: number;
    graphScore: number;
    citationScore: number;
    totalScore: number;
    tier: RelevanceTier;
  }): Promise<void> {
    await run(
      db,
      `INSERT INTO run_papers (
         run_id, paper_id, lexical_score, graph_score, citation_score, total_score, tier
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id, paper_id) DO UPDATE SET
         lexical_score=excluded.lexical_score,
         graph_score=excluded.graph_score,
         citation_score=excluded.citation_score,
         total_score=excluded.total_score,
         tier=excluded.tier`,
      input.runId,
      input.paperId,
      input.lexicalScore,
      input.graphScore,
      input.citationScore,
      input.totalScore,
      input.tier
    );
  },

  async insertEvidence(db: D1Database, input: {
    runId: string;
    entityType: string;
    entityId: string;
    source: string;
    detail: unknown;
  }): Promise<void> {
    await run(
      db,
      `INSERT INTO evidence (id, run_id, entity_type, entity_id, source, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      input.runId,
      input.entityType,
      input.entityId,
      input.source,
      JSON.stringify(input.detail),
      nowIso()
    );
  },

  async upsertPaperAccess(db: D1Database, input: {
    paperId: string;
    pdfUrl?: string;
    oaStatus?: string;
    license?: string;
  }): Promise<void> {
    await run(
      db,
      `INSERT INTO paper_access (paper_id, pdf_url, oa_status, license, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(paper_id) DO UPDATE SET
         pdf_url=COALESCE(excluded.pdf_url, paper_access.pdf_url),
         oa_status=COALESCE(excluded.oa_status, paper_access.oa_status),
         license=COALESCE(excluded.license, paper_access.license),
         updated_at=excluded.updated_at`,
      input.paperId,
      input.pdfUrl ?? null,
      input.oaStatus ?? null,
      input.license ?? null,
      nowIso()
    );
  },

  async listRunPapersOwned(db: D1Database, runId: string, userId: string): Promise<Array<{
    paper_id: string;
    openalex_id: string;
    semantic_scholar_id: string | null;
    doi: string | null;
    title: string;
    abstract: string | null;
    year: number | null;
    citation_count: number | null;
    fields_of_study_json: string;
    lexical_score: number;
    graph_score: number;
    citation_score: number;
    total_score: number;
    tier: RelevanceTier;
    pdf_url: string | null;
    oa_status: string | null;
    license: string | null;
  }>> {
    return all(
      db,
      `SELECT
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
         pa.license
       FROM runs r
       INNER JOIN run_papers rp ON rp.run_id = r.id
       INNER JOIN papers p ON p.id = rp.paper_id
       LEFT JOIN paper_access pa ON pa.paper_id = p.id
       WHERE r.id = ? AND r.user_id = ?
       ORDER BY rp.total_score DESC, p.citation_count DESC`,
      runId,
      userId
    );
  },

  async listRunAuthorsOwned(db: D1Database, runId: string, userId: string): Promise<Array<{
    author_id: string;
    openalex_id: string | null;
    name: string;
    orcid: string | null;
    paper_count: number;
  }>> {
    return all(
      db,
      `SELECT
         a.id AS author_id,
         a.openalex_id,
         a.name,
         a.orcid,
         COUNT(DISTINCT rp.paper_id) AS paper_count
       FROM runs r
       INNER JOIN run_papers rp ON rp.run_id = r.id
       INNER JOIN paper_authors pa ON pa.paper_id = rp.paper_id
       INNER JOIN authors a ON a.id = pa.author_id
       WHERE r.id = ? AND r.user_id = ?
       GROUP BY a.id
       ORDER BY paper_count DESC, a.name ASC`,
      runId,
      userId
    );
  },

  async listRunPaperAuthorsOwned(db: D1Database, runId: string, userId: string): Promise<Array<{
    paper_id: string;
    author_id: string;
    openalex_id: string | null;
    name: string;
    orcid: string | null;
    author_position: number;
  }>> {
    return all(
      db,
      `SELECT
         p.id AS paper_id,
         a.id AS author_id,
         a.openalex_id,
         a.name,
         a.orcid,
         pa.author_position
       FROM runs r
       INNER JOIN run_papers rp ON rp.run_id = r.id
       INNER JOIN papers p ON p.id = rp.paper_id
       INNER JOIN paper_authors pa ON pa.paper_id = p.id
       INNER JOIN authors a ON a.id = pa.author_id
       WHERE r.id = ? AND r.user_id = ?
       ORDER BY p.title ASC, pa.author_position ASC`,
      runId,
      userId
    );
  },

  async listRunPaperCitationsOwned(db: D1Database, runId: string, userId: string): Promise<Array<{
    paper_id: string;
    cited_openalex_id: string;
    cited_title: string | null;
    cited_in_run: number;
  }>> {
    return all(
      db,
      `SELECT
         src.id AS paper_id,
         pc.cited_openalex_id,
         dst.title AS cited_title,
         CASE WHEN rp_cited.paper_id IS NULL THEN 0 ELSE 1 END AS cited_in_run
       FROM runs r
       INNER JOIN run_papers rp_src ON rp_src.run_id = r.id
       INNER JOIN papers src ON src.id = rp_src.paper_id
       INNER JOIN paper_citations pc ON pc.paper_id = src.id
       LEFT JOIN papers dst ON dst.openalex_id = pc.cited_openalex_id
       LEFT JOIN run_papers rp_cited ON rp_cited.run_id = r.id AND rp_cited.paper_id = dst.id
       WHERE r.id = ? AND r.user_id = ?
       ORDER BY src.title ASC, pc.cited_openalex_id ASC`,
      runId,
      userId
    );
  },

  async listEvidenceOwned(
    db: D1Database,
    runId: string,
    userId: string,
    entityType?: string,
    entityId?: string
  ): Promise<Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    source: string;
    detail_json: string;
    created_at: string;
  }>> {
    const filters = ["r.id = ?", "r.user_id = ?"];
    const params: unknown[] = [runId, userId];
    if (entityType) {
      filters.push("e.entity_type = ?");
      params.push(entityType);
    }
    if (entityId) {
      filters.push("e.entity_id = ?");
      params.push(entityId);
    }

    return all(
      db,
      `SELECT e.id, e.entity_type, e.entity_id, e.source, e.detail_json, e.created_at
       FROM runs r
       INNER JOIN evidence e ON e.run_id = r.id
       WHERE ${filters.join(" AND ")}
       ORDER BY e.created_at DESC`,
      ...params
    );
  },

  async metricsRunsByStatus(db: D1Database): Promise<Record<RunStatus, number>> {
    const rows = await all<{ status: RunStatus; total: number }>(
      db,
      `SELECT status, COUNT(*) AS total FROM runs GROUP BY status`
    );
    const metrics: Record<RunStatus, number> = {
      QUEUED: 0,
      RUNNING: 0,
      COMPLETED: 0,
      FAILED: 0
    };
    for (const row of rows) {
      metrics[row.status] = row.total;
    }
    return metrics;
  }
};

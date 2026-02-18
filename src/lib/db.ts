import type {
  RelevanceTier,
  RunStatus,
  SessionUser
} from "./types.js";

const nowIso = (): string => new Date().toISOString();

const first = async <T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T | null> => {
  const row = await db.prepare(sql).bind(...binds).first<T>();
  return row ?? null;
};

const all = async <T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T[]> => {
  const result = await db.prepare(sql).bind(...binds).all<T>();
  return result.results;
};

const run = async (db: D1Database, sql: string, ...binds: unknown[]): Promise<void> => {
  await db.prepare(sql).bind(...binds).run();
};

const runChanges = async (db: D1Database, sql: string, ...binds: unknown[]): Promise<number> => {
  const result = await db.prepare(sql).bind(...binds).run();
  return Number((result as { meta?: { changes?: number } }).meta?.changes ?? 0);
};

export interface RunRow {
  id: string;
  user_id: string;
  thesis_id: string;
  status: RunStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export const Db = {
  async createOrUpdateGoogleUser(db: D1Database, input: {
    googleSub: string;
    email: string;
    name: string;
  }): Promise<SessionUser> {
    const existingBySub = await first<{ id: string }>(
      db,
      `SELECT id FROM users WHERE google_sub = ?`,
      input.googleSub
    );

    if (existingBySub) {
      try {
        await run(
          db,
          `UPDATE users SET email = ?, name = ? WHERE id = ?`,
          input.email,
          input.name,
          existingBySub.id
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("UNIQUE constraint failed: users.email")) {
          throw new Error("EMAIL_ALREADY_IN_USE");
        }
        throw error;
      }
      const user = await first<SessionUser>(
        db,
        `SELECT id, email, name FROM users WHERE id = ?`,
        existingBySub.id
      );
      if (!user) {
        throw new Error("Failed to load updated Google user");
      }
      return user;
    }

    const id = crypto.randomUUID();
    try {
      await run(
        db,
        `INSERT INTO users (id, email, name, google_sub, created_at) VALUES (?, ?, ?, ?, ?)`,
        id,
        input.email,
        input.name,
        input.googleSub,
        nowIso()
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("UNIQUE constraint failed: users.email")) {
        throw new Error("EMAIL_ALREADY_IN_USE");
      }
      throw error;
    }

    return {
      id,
      email: input.email,
      name: input.name
    };
  },

  async createSession(db: D1Database, input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void> {
    await run(
      db,
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      input.userId,
      input.tokenHash,
      input.expiresAt,
      nowIso()
    );
  },

  async getSessionUser(db: D1Database, tokenHash: string): Promise<SessionUser | null> {
    return first<SessionUser>(
      db,
      `SELECT u.id, u.email, u.name
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      tokenHash,
      nowIso()
    );
  },

  async deleteSession(db: D1Database, tokenHash: string): Promise<void> {
    await run(db, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash);
  },

  async createThesis(db: D1Database, input: {
    userId: string;
    title: string;
    text: string;
  }): Promise<{ id: string; title: string; created_at: string }> {
    const id = crypto.randomUUID();
    const created = nowIso();
    await run(
      db,
      `INSERT INTO theses (id, user_id, title, text, created_at) VALUES (?, ?, ?, ?, ?)`,
      id,
      input.userId,
      input.title,
      input.text,
      created
    );
    return {
      id,
      title: input.title,
      created_at: created
    };
  },

  async listThesesByUser(db: D1Database, userId: string): Promise<Array<{
    id: string;
    title: string;
    text: string;
    created_at: string;
  }>> {
    return all(
      db,
      `SELECT id, title, text, created_at FROM theses WHERE user_id = ? ORDER BY created_at DESC`,
      userId
    );
  },

  async getThesisOwned(db: D1Database, thesisId: string, userId: string): Promise<{
    id: string;
    title: string;
    text: string;
    created_at: string;
  } | null> {
    return first(
      db,
      `SELECT id, title, text, created_at FROM theses WHERE id = ? AND user_id = ?`,
      thesisId,
      userId
    );
  },

  async createRun(db: D1Database, input: {
    userId: string;
    thesisId: string;
  }): Promise<RunRow> {
    const thesis = await this.getThesisOwned(db, input.thesisId, input.userId);
    if (!thesis) {
      throw new Error("THESIS_NOT_FOUND");
    }

    const id = crypto.randomUUID();
    const now = nowIso();
    await run(
      db,
      `INSERT INTO runs (id, user_id, thesis_id, status, created_at, updated_at) VALUES (?, ?, ?, 'QUEUED', ?, ?)`,
      id,
      input.userId,
      input.thesisId,
      now,
      now
    );

    return {
      id,
      user_id: input.userId,
      thesis_id: input.thesisId,
      status: "QUEUED",
      error: null,
      created_at: now,
      updated_at: now
    };
  },

  async listRunsByUser(db: D1Database, userId: string): Promise<RunRow[]> {
    return all(
      db,
      `SELECT id, user_id, thesis_id, status, error, created_at, updated_at
       FROM runs
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      userId
    );
  },

  async getRunOwned(db: D1Database, runId: string, userId: string): Promise<RunRow | null> {
    return first(
      db,
      `SELECT id, user_id, thesis_id, status, error, created_at, updated_at
       FROM runs
       WHERE id = ? AND user_id = ?`,
      runId,
      userId
    );
  },

  async getRunById(db: D1Database, runId: string): Promise<RunRow | null> {
    return first(
      db,
      `SELECT id, user_id, thesis_id, status, error, created_at, updated_at
       FROM runs
       WHERE id = ?`,
      runId
    );
  },

  async markRunRunningIfQueued(db: D1Database, runId: string): Promise<boolean> {
    const changes = await runChanges(
      db,
      `UPDATE runs SET status = 'RUNNING', error = NULL, updated_at = ?
       WHERE id = ? AND status = 'QUEUED'`,
      nowIso(),
      runId
    );
    return changes > 0;
  },

  async updateRunStatus(db: D1Database, runId: string, status: RunStatus, error?: string): Promise<void> {
    await run(
      db,
      `UPDATE runs SET status = ?, error = ?, updated_at = ? WHERE id = ?`,
      status,
      error ?? null,
      nowIso(),
      runId
    );
  },

  async clearRunData(db: D1Database, runId: string): Promise<void> {
    await run(db, `DELETE FROM run_papers WHERE run_id = ?`, runId);
    await run(db, `DELETE FROM edges WHERE run_id = ?`, runId);
    await run(db, `DELETE FROM evidence WHERE run_id = ?`, runId);
    await run(db, `DELETE FROM run_steps WHERE run_id = ?`, runId);
  },

  async createRunStep(db: D1Database, runId: string, stepName: string, attempt: number): Promise<string> {
    const id = crypto.randomUUID();
    await run(
      db,
      `INSERT INTO run_steps (id, run_id, step_name, status, attempt, started_at)
       VALUES (?, ?, ?, 'RUNNING', ?, ?)`,
      id,
      runId,
      stepName,
      attempt,
      nowIso()
    );
    return id;
  },

  async completeRunStep(db: D1Database, runStepId: string, payload: unknown): Promise<void> {
    await run(
      db,
      `UPDATE run_steps SET status='COMPLETED', finished_at=?, payload_json=? WHERE id = ?`,
      nowIso(),
      JSON.stringify(payload),
      runStepId
    );
  },

  async failRunStep(db: D1Database, runStepId: string, error: string): Promise<void> {
    await run(
      db,
      `UPDATE run_steps SET status='FAILED', finished_at=?, error=? WHERE id = ?`,
      nowIso(),
      error,
      runStepId
    );
  },

  async listRunStepsOwned(db: D1Database, runId: string, userId: string): Promise<Array<{
    id: string;
    step_name: string;
    status: string;
    attempt: number;
    started_at: string;
    finished_at: string | null;
    error: string | null;
    payload_json: string | null;
  }>> {
    return all(
      db,
      `SELECT rs.id, rs.step_name, rs.status, rs.attempt, rs.started_at, rs.finished_at, rs.error, rs.payload_json
       FROM run_steps rs
       INNER JOIN runs r ON r.id = rs.run_id
       WHERE rs.run_id = ? AND r.user_id = ?
       ORDER BY rs.started_at ASC`,
      runId,
      userId
    );
  },

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

  async upsertEdge(db: D1Database, input: {
    runId: string;
    srcPaperId: string;
    dstPaperId: string;
    edgeType: "REFERENCE" | "CITATION" | "SHARED_AUTHOR";
    weight: number;
    evidence: unknown;
  }): Promise<void> {
    await run(
      db,
      `INSERT INTO edges (id, run_id, src_paper_id, dst_paper_id, edge_type, weight, evidence_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id, src_paper_id, dst_paper_id, edge_type)
       DO UPDATE SET
         weight=excluded.weight,
         evidence_json=excluded.evidence_json`,
      crypto.randomUUID(),
      input.runId,
      input.srcPaperId,
      input.dstPaperId,
      input.edgeType,
      input.weight,
      JSON.stringify(input.evidence)
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

  async listRunEdgesOwned(db: D1Database, runId: string, userId: string): Promise<Array<{
    edge_id: string;
    source_openalex_id: string;
    source_title: string;
    target_openalex_id: string;
    target_title: string;
    edge_type: "REFERENCE" | "CITATION" | "SHARED_AUTHOR";
    weight: number;
    evidence_json: string;
  }>> {
    return all(
      db,
      `SELECT
         e.id AS edge_id,
         src.openalex_id AS source_openalex_id,
         src.title AS source_title,
         dst.openalex_id AS target_openalex_id,
         dst.title AS target_title,
         e.edge_type,
         e.weight,
         e.evidence_json
       FROM runs r
       INNER JOIN edges e ON e.run_id = r.id
       INNER JOIN papers src ON src.id = e.src_paper_id
       INNER JOIN papers dst ON dst.id = e.dst_paper_id
       WHERE r.id = ? AND r.user_id = ?
       ORDER BY e.weight DESC, e.edge_type ASC`,
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
  },

  async ensureGlobalRateLimitKey(db: D1Database, key: string): Promise<void> {
    await run(
      db,
      `INSERT INTO global_rate_limits (rate_key, next_allowed_at_ms, updated_at)
       VALUES (?, 0, ?)
       ON CONFLICT(rate_key) DO NOTHING`,
      key,
      nowIso()
    );
  },

  async readGlobalRateLimitNextAllowedMs(db: D1Database, key: string): Promise<number> {
    const row = await first<{ next_allowed_at_ms: number }>(
      db,
      `SELECT next_allowed_at_ms FROM global_rate_limits WHERE rate_key = ?`,
      key
    );
    return Number(row?.next_allowed_at_ms ?? 0);
  },

  async compareAndSetGlobalRateLimit(
    db: D1Database,
    key: string,
    expectedNextAllowedMs: number,
    newNextAllowedMs: number
  ): Promise<boolean> {
    const changes = await runChanges(
      db,
      `UPDATE global_rate_limits
       SET next_allowed_at_ms = ?, updated_at = ?
       WHERE rate_key = ? AND next_allowed_at_ms = ?`,
      newNextAllowedMs,
      nowIso(),
      key,
      expectedNextAllowedMs
    );
    return changes > 0;
  },

  async tryAcquireGlobalRateLimitWindow(
    db: D1Database,
    key: string,
    minIntervalMs: number
  ): Promise<{ allowed: boolean; retryAfterMs: number }> {
    await this.ensureGlobalRateLimitKey(db, key);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const now = Date.now();
      const expectedNextAllowedMs = await this.readGlobalRateLimitNextAllowedMs(db, key);
      if (expectedNextAllowedMs > now) {
        return { allowed: false, retryAfterMs: expectedNextAllowedMs - now };
      }
      const updated = await this.compareAndSetGlobalRateLimit(
        db,
        key,
        expectedNextAllowedMs,
        now + minIntervalMs
      );
      if (updated) {
        return { allowed: true, retryAfterMs: 0 };
      }
    }
    return { allowed: false, retryAfterMs: minIntervalMs };
  }
};

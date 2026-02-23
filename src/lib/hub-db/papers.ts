import { all, first, normalizeBool, nowIso, run, runChanges, safeJsonParse } from "./base.js";
import type { ProjectPaperRow } from "./types.js";

export const papersRepo = {
  async listProjectPapersOwned(db: D1Database, input: {
    projectId: string;
    userId: string;
    query?: string;
    sort?: "relevance" | "recent" | "citations" | "newest";
    oaOnly?: boolean;
    bookmarkedOnly?: boolean;
    readingOnly?: boolean;
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ProjectPaperRow[]> {
    const filters = ["pp.project_id = ?", "t.user_id = ?"];
    const params: unknown[] = [input.projectId, input.userId];

    if (!input.includeDeleted) {
      filters.push("pp.is_deleted = 0");
    }

    const query = input.query?.trim().toLowerCase();
    if (query) {
      const like = `%${query}%`;
      filters.push("(lower(pp.title) LIKE ? OR lower(COALESCE(pp.abstract, '')) LIKE ? OR lower(COALESCE(pp.doi, '')) LIKE ?)");
      params.push(like, like, like);
    }

    if (input.oaOnly) {
      filters.push("(pp.pdf_url IS NOT NULL OR (pp.oa_status IS NOT NULL AND trim(pp.oa_status) <> ''))");
    }
    if (input.bookmarkedOnly) {
      filters.push("pp.bookmarked = 1");
    }
    if (input.readingOnly) {
      filters.push("pp.in_reading_list = 1");
    }

    const sort = input.sort ?? "relevance";
    const orderBy =
      sort === "recent"
        ? "pp.year DESC, pp.citation_count DESC, pp.updated_at DESC"
        : sort === "citations"
          ? "pp.citation_count DESC, pp.updated_at DESC"
          : sort === "newest"
            ? "pp.created_at DESC"
            : "pp.score_total DESC, pp.citation_count DESC, pp.updated_at DESC";

    const limit = Math.max(1, Math.min(500, input.limit ?? 200));
    const offset = Math.max(0, input.offset ?? 0);
    params.push(limit, offset);

    return all<ProjectPaperRow>(
      db,
      `SELECT
         pp.*
       FROM project_papers pp
       INNER JOIN theses t ON t.id = pp.project_id
       WHERE ${filters.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      ...params
    );
  },

  async getProjectPaperOwned(db: D1Database, input: {
    projectPaperId: string;
    projectId: string;
    userId: string;
  }): Promise<ProjectPaperRow | null> {
    return first<ProjectPaperRow>(
      db,
      `SELECT
         pp.*
       FROM project_papers pp
       INNER JOIN theses t ON t.id = pp.project_id
       WHERE pp.id = ? AND pp.project_id = ? AND t.user_id = ?`,
      input.projectPaperId,
      input.projectId,
      input.userId
    );
  },

  async addManualProjectPaper(db: D1Database, input: {
    projectId: string;
    title: string;
    abstract?: string;
    year?: number;
    doi?: string;
    citationCount?: number;
    fieldsOfStudy?: string[];
    bookmarked?: boolean;
    inReadingList?: boolean;
    noteText?: string;
    tags?: string[];
  }): Promise<{ id: string; created_at: string }> {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    await run(
      db,
      `INSERT INTO project_papers (
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
         created_at,
         updated_at
       ) VALUES (?, ?, 'manual', NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, 0, ?, ?)`,
      id,
      input.projectId,
      input.doi?.trim() || null,
      input.title.trim(),
      input.abstract?.trim() || null,
      input.year ?? null,
      input.citationCount ?? null,
      JSON.stringify(input.fieldsOfStudy ?? []),
      input.bookmarked ? 1 : 0,
      input.inReadingList ? 1 : 0,
      JSON.stringify(input.tags ?? []),
      input.noteText?.trim() || null,
      createdAt,
      createdAt
    );
    return { id, created_at: createdAt };
  },

  async updateProjectPaperOwned(db: D1Database, input: {
    projectPaperId: string;
    projectId: string;
    userId: string;
    patch: {
      title?: string;
      abstract?: string | null;
      year?: number | null;
      doi?: string | null;
      citationCount?: number | null;
      fieldsOfStudy?: string[];
      bookmarked?: boolean;
      inReadingList?: boolean;
      noteText?: string | null;
      tags?: string[];
      isDeleted?: boolean;
    };
  }): Promise<ProjectPaperRow | null> {
    const existing = await this.getProjectPaperOwned(db, {
      projectPaperId: input.projectPaperId,
      projectId: input.projectId,
      userId: input.userId
    });
    if (!existing) {
      return null;
    }

    const patch = input.patch;
    const nextTitle = typeof patch.title === "string" ? patch.title.trim() : existing.title;
    const nextAbstract =
      patch.abstract === undefined ? existing.abstract : (patch.abstract?.trim() || null);
    const nextYear = patch.year === undefined ? existing.year : patch.year;
    const nextDoi = patch.doi === undefined ? existing.doi : (patch.doi?.trim() || null);
    const nextCitationCount =
      patch.citationCount === undefined ? existing.citation_count : patch.citationCount;
    const nextFieldsOfStudy =
      patch.fieldsOfStudy === undefined
        ? safeJsonParse<string[]>(existing.fields_of_study_json, [])
        : patch.fieldsOfStudy;
    const nextBookmarked = normalizeBool(patch.bookmarked, existing.bookmarked === 1) ? 1 : 0;
    const nextReading = normalizeBool(patch.inReadingList, existing.in_reading_list === 1) ? 1 : 0;
    const nextNote = patch.noteText === undefined ? existing.note_text : (patch.noteText?.trim() || null);
    const nextTags =
      patch.tags === undefined ? safeJsonParse<string[]>(existing.tags_json, []) : patch.tags;
    const nextIsDeleted = normalizeBool(patch.isDeleted, existing.is_deleted === 1) ? 1 : 0;

    await run(
      db,
      `UPDATE project_papers
       SET
         title = ?,
         abstract = ?,
         year = ?,
         doi = ?,
         citation_count = ?,
         fields_of_study_json = ?,
         bookmarked = ?,
         in_reading_list = ?,
         note_text = ?,
         tags_json = ?,
         is_deleted = ?,
         updated_at = ?
       WHERE id = ? AND project_id = ?`,
      nextTitle || existing.title,
      nextAbstract,
      nextYear,
      nextDoi,
      nextCitationCount,
      JSON.stringify(nextFieldsOfStudy),
      nextBookmarked,
      nextReading,
      nextNote,
      JSON.stringify(nextTags),
      nextIsDeleted,
      nowIso(),
      input.projectPaperId,
      input.projectId
    );

    return this.getProjectPaperOwned(db, {
      projectPaperId: input.projectPaperId,
      projectId: input.projectId,
      userId: input.userId
    });
  },

  async softDeleteProjectPaperOwned(db: D1Database, input: {
    projectPaperId: string;
    projectId: string;
    userId: string;
  }): Promise<boolean> {
    const existing = await this.getProjectPaperOwned(db, input);
    if (!existing) {
      return false;
    }
    const changes = await runChanges(
      db,
      `UPDATE project_papers
       SET is_deleted = 1, updated_at = ?
       WHERE id = ? AND project_id = ?`,
      nowIso(),
      input.projectPaperId,
      input.projectId
    );
    return changes > 0;
  },

  async listProjectPaperCommentsOwned(db: D1Database, input: {
    projectPaperId: string;
    projectId: string;
    userId: string;
  }): Promise<Array<{
    id: string;
    body: string;
    created_at: string;
    updated_at: string;
  }>> {
    return all(
      db,
      `SELECT c.id, c.body, c.created_at, c.updated_at
       FROM project_paper_comments c
       INNER JOIN project_papers pp ON pp.id = c.project_paper_id
       INNER JOIN theses t ON t.id = pp.project_id
       WHERE c.project_paper_id = ? AND c.project_id = ? AND t.user_id = ?
       ORDER BY c.created_at DESC`,
      input.projectPaperId,
      input.projectId,
      input.userId
    );
  },

  async createProjectPaperCommentOwned(db: D1Database, input: {
    projectPaperId: string;
    projectId: string;
    userId: string;
    body: string;
  }): Promise<{ id: string; body: string; created_at: string; updated_at: string } | null> {
    const paper = await this.getProjectPaperOwned(db, {
      projectPaperId: input.projectPaperId,
      projectId: input.projectId,
      userId: input.userId
    });
    if (!paper) {
      return null;
    }

    const id = crypto.randomUUID();
    const now = nowIso();
    await run(
      db,
      `INSERT INTO project_paper_comments (
         id,
         project_paper_id,
         project_id,
         user_id,
         body,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.projectPaperId,
      input.projectId,
      input.userId,
      input.body.trim(),
      now,
      now
    );

    return { id, body: input.body.trim(), created_at: now, updated_at: now };
  },

  async deleteProjectPaperCommentOwned(db: D1Database, input: {
    commentId: string;
    projectPaperId: string;
    projectId: string;
    userId: string;
  }): Promise<boolean> {
    const changes = await runChanges(
      db,
      `DELETE FROM project_paper_comments
       WHERE id = ?
         AND project_paper_id = ?
         AND project_id = ?
         AND user_id = ?`,
      input.commentId,
      input.projectPaperId,
      input.projectId,
      input.userId
    );
    return changes > 0;
  },

  async syncProjectPipelinePapersFromRun(db: D1Database, input: {
    runId: string;
    projectId: string;
  }): Promise<void> {
    const now = nowIso();
    await run(
      db,
      `INSERT INTO project_papers (
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
         created_at,
         updated_at
       )
       SELECT
         'pp_' || lower(hex(randomblob(16))),
         r.thesis_id,
         'pipeline',
         p.id,
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
         pa.pdf_url,
         pa.oa_status,
         pa.license,
         0,
         0,
         '[]',
         NULL,
         0,
         ?,
         ?
       FROM runs r
       INNER JOIN run_papers rp ON rp.run_id = r.id
       INNER JOIN papers p ON p.id = rp.paper_id
       LEFT JOIN paper_access pa ON pa.paper_id = p.id
       WHERE r.id = ? AND r.thesis_id = ?
       ON CONFLICT(project_id, paper_id) DO UPDATE SET
         source = 'pipeline',
         openalex_id = excluded.openalex_id,
         semantic_scholar_id = COALESCE(excluded.semantic_scholar_id, project_papers.semantic_scholar_id),
         doi = COALESCE(excluded.doi, project_papers.doi),
         title = excluded.title,
         abstract = COALESCE(excluded.abstract, project_papers.abstract),
         year = COALESCE(excluded.year, project_papers.year),
         citation_count = COALESCE(excluded.citation_count, project_papers.citation_count),
         fields_of_study_json = excluded.fields_of_study_json,
         score_lexical = excluded.score_lexical,
         score_graph = excluded.score_graph,
         score_citation = excluded.score_citation,
         score_total = excluded.score_total,
         pdf_url = COALESCE(excluded.pdf_url, project_papers.pdf_url),
         oa_status = COALESCE(excluded.oa_status, project_papers.oa_status),
         license = COALESCE(excluded.license, project_papers.license),
         updated_at = excluded.updated_at`,
      now,
      now,
      input.runId,
      input.projectId
    );
  },

  async updateProjectPaperAccessByRunAndPaper(db: D1Database, input: {
    runId: string;
    paperId: string;
    pdfUrl?: string;
    oaStatus?: string;
    license?: string;
  }): Promise<void> {
    await run(
      db,
      `UPDATE project_papers
       SET
         pdf_url = COALESCE(?, pdf_url),
         oa_status = COALESCE(?, oa_status),
         license = COALESCE(?, license),
         updated_at = ?
       WHERE project_id = (SELECT thesis_id FROM runs WHERE id = ?)
         AND paper_id = ?`,
      input.pdfUrl ?? null,
      input.oaStatus ?? null,
      input.license ?? null,
      nowIso(),
      input.runId,
      input.paperId
    );
  }
};

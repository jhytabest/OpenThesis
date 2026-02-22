import type { RunStatus } from "../types.js";
import { all, first, nowIso, run, runChanges } from "./base.js";
import type { ProjectListRow } from "./types.js";

export const projectsRepo = {
  async createProject(db: D1Database, input: {
    userId: string;
    title?: string;
    thesisText: string;
  }): Promise<{ id: string; title: string | null; text: string; created_at: string }> {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    await run(
      db,
      `INSERT INTO theses (id, user_id, title, text, created_at) VALUES (?, ?, ?, ?, ?)`,
      id,
      input.userId,
      input.title?.trim() || null,
      input.thesisText,
      createdAt
    );
    return {
      id,
      title: input.title?.trim() || null,
      text: input.thesisText,
      created_at: createdAt
    };
  },

  async listProjectsByUser(db: D1Database, userId: string): Promise<ProjectListRow[]> {
    return all<ProjectListRow>(
      db,
      `WITH latest_runs AS (
         SELECT
           r.id,
           r.thesis_id,
           r.status,
           r.updated_at,
           ROW_NUMBER() OVER (
             PARTITION BY r.thesis_id
             ORDER BY r.created_at DESC, r.updated_at DESC
           ) AS row_num
         FROM runs r
         WHERE r.user_id = ?
       ),
       paper_stats AS (
         SELECT
           project_id,
           SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) AS paper_count,
           SUM(CASE WHEN is_deleted = 0 AND in_reading_list = 1 THEN 1 ELSE 0 END) AS reading_count,
           SUM(CASE WHEN is_deleted = 0 AND bookmarked = 1 THEN 1 ELSE 0 END) AS bookmarked_count
         FROM project_papers
         GROUP BY project_id
       ),
       chat_stats AS (
         SELECT
           project_id,
           COUNT(*) AS chat_count
         FROM project_chats
         GROUP BY project_id
       )
       SELECT
         t.id,
         t.title,
         t.text,
         t.created_at,
         lr.id AS latest_run_id,
         lr.status AS latest_run_status,
         lr.updated_at AS latest_run_updated_at,
         COALESCE(ps.paper_count, 0) AS paper_count,
         COALESCE(ps.reading_count, 0) AS reading_count,
         COALESCE(ps.bookmarked_count, 0) AS bookmarked_count,
         COALESCE(cs.chat_count, 0) AS chat_count
       FROM theses t
       LEFT JOIN latest_runs lr ON lr.thesis_id = t.id AND lr.row_num = 1
       LEFT JOIN paper_stats ps ON ps.project_id = t.id
       LEFT JOIN chat_stats cs ON cs.project_id = t.id
       WHERE t.user_id = ?
       ORDER BY t.created_at DESC`,
      userId,
      userId
    );
  },

  async getProjectOwned(db: D1Database, projectId: string, userId: string): Promise<{
    id: string;
    title: string | null;
    text: string;
    created_at: string;
  } | null> {
    return first(
      db,
      `SELECT id, title, text, created_at
       FROM theses
       WHERE id = ? AND user_id = ?`,
      projectId,
      userId
    );
  },

  async updateProjectOwned(db: D1Database, input: {
    projectId: string;
    userId: string;
    title?: string;
    thesisText?: string;
  }): Promise<boolean> {
    const current = await this.getProjectOwned(db, input.projectId, input.userId);
    if (!current) {
      return false;
    }
    const nextTitle = typeof input.title === "string" ? input.title.trim() : current.title;
    const nextText = typeof input.thesisText === "string" ? input.thesisText : current.text;
    const changes = await runChanges(
      db,
      `UPDATE theses SET title = ?, text = ? WHERE id = ? AND user_id = ?`,
      nextTitle || null,
      nextText,
      input.projectId,
      input.userId
    );
    return changes > 0;
  },

  async deleteProjectOwned(db: D1Database, projectId: string, userId: string): Promise<boolean> {
    const changes = await runChanges(
      db,
      `DELETE FROM theses WHERE id = ? AND user_id = ?`,
      projectId,
      userId
    );
    return changes > 0;
  },

  async getProjectLatestRunOwned(db: D1Database, projectId: string, userId: string): Promise<{
    id: string;
    status: RunStatus;
    error: string | null;
    created_at: string;
    updated_at: string;
  } | null> {
    return first(
      db,
      `SELECT id, status, error, created_at, updated_at
       FROM runs
       WHERE thesis_id = ? AND user_id = ?
       ORDER BY created_at DESC, updated_at DESC
       LIMIT 1`,
      projectId,
      userId
    );
  }
};

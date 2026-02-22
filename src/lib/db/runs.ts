import type { RunStatus } from "../types.js";
import { all, first, nowIso, run, runChanges, toNonNegativeInt } from "./base.js";
import { accountRepo } from "./account.js";
import type { RunEnrichmentProgress, RunRow } from "./types.js";

export const runsRepo = {
  async createRun(db: D1Database, input: {
    userId: string;
    thesisId: string;
  }): Promise<RunRow> {
    const thesis = await accountRepo.getThesisOwned(db, input.thesisId, input.userId);
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

  async listRunEnrichmentProgressByUser(
    db: D1Database,
    userId: string
  ): Promise<RunEnrichmentProgress[]> {
    const rows = await all<{
      run_id: string;
      enqueued_count: number;
      lookup_completed_count: number;
      lookup_found_count: number;
      lookup_not_found_count: number;
      lookup_failed_count: number;
    }>(
      db,
      `SELECT
         r.id AS run_id,
         COALESCE(res.enqueued_count, 0) AS enqueued_count,
         COALESCE(res.lookup_completed_count, 0) AS lookup_completed_count,
         COALESCE(res.lookup_found_count, 0) AS lookup_found_count,
         COALESCE(res.lookup_not_found_count, 0) AS lookup_not_found_count,
         COALESCE(res.lookup_failed_count, 0) AS lookup_failed_count
       FROM runs r
       LEFT JOIN run_enrichment_stats res ON res.run_id = r.id
       WHERE r.user_id = ?`,
      userId
    );

    return rows.map((row) => {
      const enqueuedCount = toNonNegativeInt(row.enqueued_count);
      const lookupCompletedCount = toNonNegativeInt(row.lookup_completed_count);
      const lookupFailedCount = toNonNegativeInt(row.lookup_failed_count);
      return {
        run_id: row.run_id,
        enqueued_count: enqueuedCount,
        lookup_completed_count: lookupCompletedCount,
        lookup_found_count: toNonNegativeInt(row.lookup_found_count),
        lookup_not_found_count: toNonNegativeInt(row.lookup_not_found_count),
        lookup_failed_count: lookupFailedCount,
        pending_count: Math.max(0, enqueuedCount - lookupCompletedCount - lookupFailedCount)
      };
    });
  },

  async getRunEnrichmentProgressOwned(
    db: D1Database,
    runId: string,
    userId: string
  ): Promise<RunEnrichmentProgress | null> {
    const row = await first<{
      run_id: string;
      enqueued_count: number;
      lookup_completed_count: number;
      lookup_found_count: number;
      lookup_not_found_count: number;
      lookup_failed_count: number;
    }>(
      db,
      `SELECT
         r.id AS run_id,
         COALESCE(res.enqueued_count, 0) AS enqueued_count,
         COALESCE(res.lookup_completed_count, 0) AS lookup_completed_count,
         COALESCE(res.lookup_found_count, 0) AS lookup_found_count,
         COALESCE(res.lookup_not_found_count, 0) AS lookup_not_found_count,
         COALESCE(res.lookup_failed_count, 0) AS lookup_failed_count
       FROM runs r
       LEFT JOIN run_enrichment_stats res ON res.run_id = r.id
       WHERE r.id = ? AND r.user_id = ?`,
      runId,
      userId
    );

    if (!row) {
      return null;
    }
    const enqueuedCount = toNonNegativeInt(row.enqueued_count);
    const lookupCompletedCount = toNonNegativeInt(row.lookup_completed_count);
    const lookupFailedCount = toNonNegativeInt(row.lookup_failed_count);
    return {
      run_id: row.run_id,
      enqueued_count: enqueuedCount,
      lookup_completed_count: lookupCompletedCount,
      lookup_found_count: toNonNegativeInt(row.lookup_found_count),
      lookup_not_found_count: toNonNegativeInt(row.lookup_not_found_count),
      lookup_failed_count: lookupFailedCount,
      pending_count: Math.max(0, enqueuedCount - lookupCompletedCount - lookupFailedCount)
    };
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
    await run(db, `DELETE FROM evidence WHERE run_id = ?`, runId);
    await run(db, `DELETE FROM run_steps WHERE run_id = ?`, runId);
    await run(db, `DELETE FROM run_enrichment_stats WHERE run_id = ?`, runId);
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
  }
};

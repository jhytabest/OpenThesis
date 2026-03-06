import type { ContextStatus, RunStatus, RunType } from "../types.js";
import { all, first, nowIso, run, runChanges, toNonNegativeInt } from "./base.js";
import { accountRepo } from "./account.js";
import type { RunArtifactRow, RunAuditEventRow, RunEnrichmentProgress, RunRow } from "./types.js";

export const runsRepo = {
  async createRun(db: D1Database, input: {
    userId: string;
    thesisId: string;
    runType?: RunType;
    contextStatus?: ContextStatus;
    inputSnapshotHash?: string | null;
  }): Promise<RunRow> {
    const thesis = await accountRepo.getThesisOwned(db, input.thesisId, input.userId);
    if (!thesis) {
      throw new Error("THESIS_NOT_FOUND");
    }

    const id = crypto.randomUUID();
    const now = nowIso();
    await run(
      db,
      `INSERT INTO runs (
         id, user_id, thesis_id, status, run_type, context_status, input_snapshot_hash, created_at, updated_at
       ) VALUES (?, ?, ?, 'QUEUED', ?, ?, ?, ?, ?)`,
      id,
      input.userId,
      input.thesisId,
      input.runType ?? "RESEARCH",
      input.contextStatus ?? "CURRENT",
      input.inputSnapshotHash ?? null,
      now,
      now
    );

    return {
      id,
      user_id: input.userId,
      thesis_id: input.thesisId,
      status: "QUEUED",
      run_type: input.runType ?? "RESEARCH",
      context_status: input.contextStatus ?? "CURRENT",
      input_snapshot_hash: input.inputSnapshotHash ?? null,
      error: null,
      created_at: now,
      updated_at: now
    };
  },

  async listRunsByUser(db: D1Database, userId: string): Promise<RunRow[]> {
    return all(
      db,
      `SELECT id, user_id, thesis_id, status, run_type, context_status, input_snapshot_hash, error, created_at, updated_at
       FROM runs
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      userId
    );
  },

  async getRunOwned(db: D1Database, runId: string, userId: string): Promise<RunRow | null> {
    return first(
      db,
      `SELECT id, user_id, thesis_id, status, run_type, context_status, input_snapshot_hash, error, created_at, updated_at
       FROM runs
       WHERE id = ? AND user_id = ?`,
      runId,
      userId
    );
  },

  async getRunById(db: D1Database, runId: string): Promise<RunRow | null> {
    return first(
      db,
      `SELECT id, user_id, thesis_id, status, run_type, context_status, input_snapshot_hash, error, created_at, updated_at
       FROM runs
       WHERE id = ?`,
      runId
    );
  },

  async listProjectRunsOwned(
    db: D1Database,
    projectId: string,
    userId: string
  ): Promise<RunRow[]> {
    return all(
      db,
      `SELECT id, user_id, thesis_id, status, run_type, context_status, input_snapshot_hash, error, created_at, updated_at
       FROM runs
       WHERE thesis_id = ? AND user_id = ?
       ORDER BY created_at DESC, updated_at DESC`,
      projectId,
      userId
    );
  },

  async getProjectRunOwned(
    db: D1Database,
    runId: string,
    projectId: string,
    userId: string
  ): Promise<RunRow | null> {
    return first(
      db,
      `SELECT id, user_id, thesis_id, status, run_type, context_status, input_snapshot_hash, error, created_at, updated_at
       FROM runs
       WHERE id = ? AND thesis_id = ? AND user_id = ?`,
      runId,
      projectId,
      userId
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

  async markRunContextStatus(db: D1Database, runId: string, status: ContextStatus): Promise<void> {
    await run(
      db,
      `UPDATE runs SET context_status = ?, updated_at = ? WHERE id = ?`,
      status,
      nowIso(),
      runId
    );
  },

  async markProjectRunsStale(db: D1Database, projectId: string, userId: string): Promise<void> {
    await run(
      db,
      `UPDATE runs
       SET context_status = 'STALE', updated_at = ?
       WHERE thesis_id = ? AND user_id = ? AND context_status = 'CURRENT'`,
      nowIso(),
      projectId,
      userId
    );
  },

  async clearRunData(db: D1Database, runId: string): Promise<void> {
    await run(db, `DELETE FROM run_papers WHERE run_id = ?`, runId);
    await run(db, `DELETE FROM evidence WHERE run_id = ?`, runId);
    await run(db, `DELETE FROM run_steps WHERE run_id = ?`, runId);
    await run(db, `DELETE FROM run_enrichment_stats WHERE run_id = ?`, runId);
    await run(db, `DELETE FROM run_artifacts WHERE run_id = ?`, runId);
    await run(db, `DELETE FROM run_doc_comments WHERE run_id = ?`, runId);
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

  async addRunInput(db: D1Database, runId: string, snapshotId: string): Promise<void> {
    await run(
      db,
      `INSERT OR IGNORE INTO run_inputs (run_id, snapshot_id) VALUES (?, ?)`,
      runId,
      snapshotId
    );
  },

  async listRunInputSnapshotsOwned(db: D1Database, runId: string, userId: string): Promise<Array<{
    snapshot_id: string;
    source_document_id: string;
    document_title: string | null;
    kind: string;
    revision_ref: string;
    checksum: string;
    created_at: string;
  }>> {
    return all(
      db,
      `SELECT
         ri.snapshot_id,
         ds.source_document_id,
         sd.title AS document_title,
         sd.kind,
         ds.revision_ref,
         ds.checksum,
         ds.created_at
       FROM run_inputs ri
       INNER JOIN runs r ON r.id = ri.run_id
       INNER JOIN document_snapshots ds ON ds.id = ri.snapshot_id
       INNER JOIN source_documents sd ON sd.id = ds.source_document_id
       WHERE ri.run_id = ? AND r.user_id = ?
       ORDER BY ds.created_at DESC`,
      runId,
      userId
    );
  },

  async addRunArtifact(db: D1Database, input: {
    runId: string;
    artifactType: string;
    title: string;
    storageKey: string;
    metadata?: unknown;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await run(
      db,
      `INSERT INTO run_artifacts (id, run_id, artifact_type, title, storage_key, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.runId,
      input.artifactType,
      input.title,
      input.storageKey,
      input.metadata ? JSON.stringify(input.metadata) : null,
      nowIso()
    );
    return id;
  },

  async listRunArtifactsOwned(db: D1Database, runId: string, userId: string): Promise<RunArtifactRow[]> {
    return all(
      db,
      `SELECT ra.id, ra.run_id, ra.artifact_type, ra.title, ra.storage_key, ra.metadata_json, ra.created_at
       FROM run_artifacts ra
       INNER JOIN runs r ON r.id = ra.run_id
       WHERE ra.run_id = ? AND r.user_id = ?
       ORDER BY ra.created_at DESC`,
      runId,
      userId
    );
  },

  async addRunAuditEvent(db: D1Database, input: {
    runId: string;
    eventType: string;
    detail: unknown;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await run(
      db,
      `INSERT INTO run_audit_events (id, run_id, event_type, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      input.runId,
      input.eventType,
      JSON.stringify(input.detail),
      nowIso()
    );
    return id;
  },

  async listRunAuditEventsOwned(db: D1Database, runId: string, userId: string): Promise<RunAuditEventRow[]> {
    return all(
      db,
      `SELECT ra.id, ra.run_id, ra.event_type, ra.detail_json, ra.created_at
       FROM run_audit_events ra
       INNER JOIN runs r ON r.id = ra.run_id
       WHERE ra.run_id = ? AND r.user_id = ?
       ORDER BY ra.created_at ASC`,
      runId,
      userId
    );
  },

  async addRunDocComment(db: D1Database, input: {
    runId: string;
    sourceDocumentId: string;
    sectionLabel: string;
    googleCommentId?: string | null;
    status: "POSTED" | "FAILED";
    error?: string | null;
  }): Promise<void> {
    await run(
      db,
      `INSERT INTO run_doc_comments (
         id, run_id, source_document_id, section_label, google_comment_id, status, error, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      input.runId,
      input.sourceDocumentId,
      input.sectionLabel,
      input.googleCommentId ?? null,
      input.status,
      input.error ?? null,
      nowIso()
    );
  },

  async listRunDocCommentsOwned(db: D1Database, runId: string, userId: string): Promise<Array<{
    id: string;
    source_document_id: string;
    section_label: string;
    google_comment_id: string | null;
    status: "POSTED" | "FAILED";
    error: string | null;
    created_at: string;
  }>> {
    return all(
      db,
      `SELECT c.id, c.source_document_id, c.section_label, c.google_comment_id, c.status, c.error, c.created_at
       FROM run_doc_comments c
       INNER JOIN runs r ON r.id = c.run_id
       WHERE c.run_id = ? AND r.user_id = ?
       ORDER BY c.created_at DESC`,
      runId,
      userId
    );
  }
};

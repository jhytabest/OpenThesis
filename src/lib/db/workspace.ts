import type { SourceDocumentKind } from "../types.js";
import { all, first, nowIso, run, runChanges } from "./base.js";

export const workspaceRepo = {
  async upsertGoogleIntegration(db: D1Database, input: {
    userId: string;
    googleAccountEmail?: string | null;
    scopes: string[];
    encryptedAccessToken: string;
    encryptedRefreshToken?: string | null;
    tokenExpiresAt?: string | null;
  }): Promise<{ id: string }> {
    const now = nowIso();
    const existing = await first<{ id: string }>(
      db,
      `SELECT id FROM google_integrations WHERE user_id = ?`,
      input.userId
    );

    if (existing) {
      await run(
        db,
        `UPDATE google_integrations
         SET
           google_account_email = ?,
           scopes_json = ?,
           encrypted_access_token = ?,
           encrypted_refresh_token = ?,
           token_expires_at = ?,
           updated_at = ?
         WHERE id = ?`,
        input.googleAccountEmail ?? null,
        JSON.stringify(input.scopes),
        input.encryptedAccessToken,
        input.encryptedRefreshToken ?? null,
        input.tokenExpiresAt ?? null,
        now,
        existing.id
      );
      return { id: existing.id };
    }

    const id = crypto.randomUUID();
    await run(
      db,
      `INSERT INTO google_integrations (
         id, user_id, google_account_email, scopes_json, encrypted_access_token,
         encrypted_refresh_token, token_expires_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.userId,
      input.googleAccountEmail ?? null,
      JSON.stringify(input.scopes),
      input.encryptedAccessToken,
      input.encryptedRefreshToken ?? null,
      input.tokenExpiresAt ?? null,
      now,
      now
    );
    return { id };
  },

  async getGoogleIntegrationByUser(db: D1Database, userId: string): Promise<{
    id: string;
    google_account_email: string | null;
    scopes_json: string;
    encrypted_access_token: string;
    encrypted_refresh_token: string | null;
    token_expires_at: string | null;
    updated_at: string;
  } | null> {
    return first(
      db,
      `SELECT id, google_account_email, scopes_json, encrypted_access_token,
              encrypted_refresh_token, token_expires_at, updated_at
       FROM google_integrations
       WHERE user_id = ?`,
      userId
    );
  },

  async upsertProjectDriveRootsOwned(db: D1Database, input: {
    projectId: string;
    userId: string;
    googleIntegrationId: string;
    rootFolderId: string;
    pullFolderId: string;
    pushFolderId: string;
  }): Promise<void> {
    const ownsProject = await first<{ id: string }>(
      db,
      `SELECT id FROM theses WHERE id = ? AND user_id = ?`,
      input.projectId,
      input.userId
    );
    if (!ownsProject) {
      throw new Error("PROJECT_NOT_FOUND");
    }

    const ownsIntegration = await first<{ id: string }>(
      db,
      `SELECT id FROM google_integrations WHERE id = ? AND user_id = ?`,
      input.googleIntegrationId,
      input.userId
    );
    if (!ownsIntegration) {
      throw new Error("GOOGLE_INTEGRATION_NOT_FOUND");
    }

    const now = nowIso();
    await run(
      db,
      `INSERT INTO project_drive_roots (
         id, project_id, google_integration_id, root_folder_id, pull_folder_id, push_folder_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         google_integration_id = excluded.google_integration_id,
         root_folder_id = excluded.root_folder_id,
         pull_folder_id = excluded.pull_folder_id,
         push_folder_id = excluded.push_folder_id,
         updated_at = excluded.updated_at`,
      crypto.randomUUID(),
      input.projectId,
      input.googleIntegrationId,
      input.rootFolderId,
      input.pullFolderId,
      input.pushFolderId,
      now,
      now
    );
  },

  async getProjectDriveRootsOwned(db: D1Database, projectId: string, userId: string): Promise<{
    id: string;
    project_id: string;
    google_integration_id: string;
    root_folder_id: string;
    pull_folder_id: string;
    push_folder_id: string;
    updated_at: string;
  } | null> {
    return first(
      db,
      `SELECT pdr.id, pdr.project_id, pdr.google_integration_id,
              pdr.root_folder_id, pdr.pull_folder_id, pdr.push_folder_id, pdr.updated_at
       FROM project_drive_roots pdr
       INNER JOIN theses t ON t.id = pdr.project_id
       WHERE pdr.project_id = ? AND t.user_id = ?`,
      projectId,
      userId
    );
  },

  async upsertSourceDocumentOwned(db: D1Database, input: {
    projectId: string;
    userId: string;
    googleFileId: string;
    kind: SourceDocumentKind;
    role?: string | null;
    title?: string | null;
    mimeType?: string | null;
    includeInRuns?: boolean;
    isDesignatedThesisDoc?: boolean;
  }): Promise<{ id: string }> {
    const ownsProject = await first<{ id: string }>(
      db,
      `SELECT id FROM theses WHERE id = ? AND user_id = ?`,
      input.projectId,
      input.userId
    );
    if (!ownsProject) {
      throw new Error("PROJECT_NOT_FOUND");
    }

    const now = nowIso();
    await run(
      db,
      `INSERT INTO source_documents (
         id, project_id, google_file_id, kind, role, title, mime_type,
         include_in_runs, is_designated_thesis_doc, active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(project_id, google_file_id) DO UPDATE SET
         kind = excluded.kind,
         role = COALESCE(excluded.role, source_documents.role),
         title = COALESCE(excluded.title, source_documents.title),
         mime_type = COALESCE(excluded.mime_type, source_documents.mime_type),
         include_in_runs = excluded.include_in_runs,
         is_designated_thesis_doc = excluded.is_designated_thesis_doc,
         active = 1,
         updated_at = excluded.updated_at`,
      crypto.randomUUID(),
      input.projectId,
      input.googleFileId,
      input.kind,
      input.role ?? null,
      input.title ?? null,
      input.mimeType ?? null,
      input.includeInRuns === false ? 0 : 1,
      input.isDesignatedThesisDoc === true ? 1 : 0,
      now,
      now
    );

    const row = await first<{ id: string }>(
      db,
      `SELECT id FROM source_documents WHERE project_id = ? AND google_file_id = ?`,
      input.projectId,
      input.googleFileId
    );
    if (!row) {
      throw new Error("SOURCE_DOCUMENT_UPSERT_FAILED");
    }
    return row;
  },

  async listSourceDocumentsOwned(db: D1Database, projectId: string, userId: string): Promise<Array<{
    id: string;
    project_id: string;
    google_file_id: string;
    kind: SourceDocumentKind;
    role: string | null;
    title: string | null;
    mime_type: string | null;
    include_in_runs: number;
    is_designated_thesis_doc: number;
    active: number;
    created_at: string;
    updated_at: string;
    latest_snapshot_id: string | null;
    latest_snapshot_created_at: string | null;
  }>> {
    return all(
      db,
      `SELECT
         sd.id,
         sd.project_id,
         sd.google_file_id,
         sd.kind,
         sd.role,
         sd.title,
         sd.mime_type,
         sd.include_in_runs,
         sd.is_designated_thesis_doc,
         sd.active,
         sd.created_at,
         sd.updated_at,
         ls.id AS latest_snapshot_id,
         ls.created_at AS latest_snapshot_created_at
       FROM source_documents sd
       INNER JOIN theses t ON t.id = sd.project_id
       LEFT JOIN document_snapshots ls ON ls.id = (
         SELECT ds2.id
         FROM document_snapshots ds2
         WHERE ds2.source_document_id = sd.id
         ORDER BY ds2.created_at DESC
         LIMIT 1
       )
       WHERE sd.project_id = ? AND t.user_id = ?
       ORDER BY sd.updated_at DESC`,
      projectId,
      userId
    );
  },

  async patchSourceDocumentOwned(db: D1Database, input: {
    projectId: string;
    userId: string;
    documentId: string;
    role?: string | null;
    includeInRuns?: boolean;
    isDesignatedThesisDoc?: boolean;
    active?: boolean;
  }): Promise<boolean> {
    const current = await first<{
      id: string;
      role: string | null;
      include_in_runs: number;
      is_designated_thesis_doc: number;
      active: number;
    }>(
      db,
      `SELECT sd.id, sd.role, sd.include_in_runs, sd.is_designated_thesis_doc, sd.active
       FROM source_documents sd
       INNER JOIN theses t ON t.id = sd.project_id
       WHERE sd.id = ? AND sd.project_id = ? AND t.user_id = ?`,
      input.documentId,
      input.projectId,
      input.userId
    );

    if (!current) {
      return false;
    }

    const changes = await runChanges(
      db,
      `UPDATE source_documents
       SET role = ?,
           include_in_runs = ?,
           is_designated_thesis_doc = ?,
           active = ?,
           updated_at = ?
       WHERE id = ?`,
      input.role === undefined ? current.role : input.role,
      input.includeInRuns === undefined ? current.include_in_runs : input.includeInRuns ? 1 : 0,
      input.isDesignatedThesisDoc === undefined
        ? current.is_designated_thesis_doc
        : input.isDesignatedThesisDoc
          ? 1
          : 0,
      input.active === undefined ? current.active : input.active ? 1 : 0,
      nowIso(),
      input.documentId
    );

    return changes > 0;
  },

  async createDocumentSnapshot(db: D1Database, input: {
    sourceDocumentId: string;
    revisionRef: string;
    checksum: string;
    sizeBytes: number;
    storageKey: string;
    metadata?: unknown;
  }): Promise<{ id: string; created: boolean }> {
    const existing = await first<{ id: string }>(
      db,
      `SELECT id
       FROM document_snapshots
       WHERE source_document_id = ? AND revision_ref = ? AND checksum = ?`,
      input.sourceDocumentId,
      input.revisionRef,
      input.checksum
    );
    if (existing) {
      return { id: existing.id, created: false };
    }

    const id = crypto.randomUUID();
    await run(
      db,
      `INSERT INTO document_snapshots (
         id, source_document_id, revision_ref, checksum, size_bytes, storage_key, metadata_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.sourceDocumentId,
      input.revisionRef,
      input.checksum,
      Math.max(0, Math.trunc(input.sizeBytes)),
      input.storageKey,
      input.metadata ? JSON.stringify(input.metadata) : null,
      nowIso()
    );
    return { id, created: true };
  },

  async listDocumentSnapshotsOwned(db: D1Database, input: {
    projectId: string;
    userId: string;
    documentId: string;
  }): Promise<Array<{
    id: string;
    source_document_id: string;
    revision_ref: string;
    checksum: string;
    size_bytes: number;
    storage_key: string;
    metadata_json: string | null;
    created_at: string;
  }>> {
    return all(
      db,
      `SELECT ds.id, ds.source_document_id, ds.revision_ref, ds.checksum, ds.size_bytes, ds.storage_key, ds.metadata_json, ds.created_at
       FROM document_snapshots ds
       INNER JOIN source_documents sd ON sd.id = ds.source_document_id
       INNER JOIN theses t ON t.id = sd.project_id
       WHERE ds.source_document_id = ? AND sd.project_id = ? AND t.user_id = ?
       ORDER BY ds.created_at DESC`,
      input.documentId,
      input.projectId,
      input.userId
    );
  },

  async listLatestSnapshotIdsForProjectOwned(db: D1Database, projectId: string, userId: string): Promise<string[]> {
    const rows = await all<{ snapshot_id: string }>(
      db,
      `SELECT ds.id AS snapshot_id
       FROM source_documents sd
       INNER JOIN theses t ON t.id = sd.project_id
       INNER JOIN document_snapshots ds ON ds.id = (
         SELECT ds2.id
         FROM document_snapshots ds2
         WHERE ds2.source_document_id = sd.id
         ORDER BY ds2.created_at DESC
         LIMIT 1
       )
       WHERE sd.project_id = ? AND t.user_id = ? AND sd.active = 1 AND sd.include_in_runs = 1`,
      projectId,
      userId
    );
    return rows.map((row) => row.snapshot_id);
  },

  async createSyncEvent(db: D1Database, input: {
    projectId: string;
    userId: string;
  }): Promise<{ id: string; created_at: string }> {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    await run(
      db,
      `INSERT INTO sync_events (id, project_id, user_id, status, created_at)
       VALUES (?, ?, ?, 'STARTED', ?)`,
      id,
      input.projectId,
      input.userId,
      createdAt
    );
    return { id, created_at: createdAt };
  },

  async completeSyncEvent(db: D1Database, input: {
    syncEventId: string;
    status: "COMPLETED" | "FAILED";
    summary?: unknown;
    error?: string;
  }): Promise<void> {
    await run(
      db,
      `UPDATE sync_events
       SET status = ?, summary_json = ?, error = ?, finished_at = ?
       WHERE id = ?`,
      input.status,
      input.summary ? JSON.stringify(input.summary) : null,
      input.error ?? null,
      nowIso(),
      input.syncEventId
    );
  },

  async listDesignatedThesisDocsByRun(db: D1Database, runId: string): Promise<Array<{
    source_document_id: string;
    google_file_id: string;
    title: string | null;
  }>> {
    return all(
      db,
      `SELECT sd.id AS source_document_id, sd.google_file_id, sd.title
       FROM runs r
       INNER JOIN source_documents sd ON sd.project_id = r.thesis_id
       WHERE r.id = ? AND sd.active = 1 AND sd.is_designated_thesis_doc = 1`,
      runId
    );
  }
};

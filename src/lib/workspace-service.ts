import { Db } from "./db.js";
import { Encrypt } from "./crypto.js";
import { OAuth } from "./oauth.js";
import { buildGoogleDriveClient, computeContentChecksum, decodeUtf8 } from "./google-drive.js";
import { Storage } from "./storage.js";
import type { Env, RunType, SourceDocumentKind } from "./types.js";

const maxSyncBytes = 8 * 1024 * 1024;

const requireEncryptionKey = (env: Env): string => {
  const key = env.ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error("ENCRYPTION_KEY is required");
  }
  return key;
};

const resolveGoogleAccessToken = async (env: Env, userId: string): Promise<{
  integrationId: string;
  accessToken: string;
  scopes: string[];
}> => {
  const integration = await Db.getGoogleIntegrationByUser(env.ALEXCLAW_DB, userId);
  if (!integration) {
    throw new Error("GOOGLE_INTEGRATION_NOT_FOUND");
  }

  const encryptionKey = requireEncryptionKey(env);
  const scopes = JSON.parse(integration.scopes_json || "[]") as string[];
  const accessToken = await Encrypt.decrypt(encryptionKey, integration.encrypted_access_token);

  const expiresAt = integration.token_expires_at ? Date.parse(integration.token_expires_at) : NaN;
  const isExpired = Number.isFinite(expiresAt) && expiresAt < Date.now() + 15_000;
  if (!isExpired) {
    return {
      integrationId: integration.id,
      accessToken,
      scopes
    };
  }

  if (!integration.encrypted_refresh_token) {
    return {
      integrationId: integration.id,
      accessToken,
      scopes
    };
  }

  const refreshToken = await Encrypt.decrypt(encryptionKey, integration.encrypted_refresh_token);
  const refreshed = await OAuth.refreshGoogleAccessToken(env, refreshToken);
  const encryptedAccess = await Encrypt.encrypt(encryptionKey, refreshed.access_token);
  const nextExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;

  await Db.upsertGoogleIntegration(env.ALEXCLAW_DB, {
    userId,
    googleAccountEmail: integration.google_account_email,
    scopes,
    encryptedAccessToken: encryptedAccess,
    encryptedRefreshToken: integration.encrypted_refresh_token,
    tokenExpiresAt: nextExpiresAt
  });

  return {
    integrationId: integration.id,
    accessToken: refreshed.access_token,
    scopes
  };
};

const computeInputSnapshotHash = async (snapshotIds: string[]): Promise<string | null> => {
  const normalized = [...new Set(snapshotIds)].sort();
  if (normalized.length === 0) {
    return null;
  }
  const payload = new TextEncoder().encode(normalized.join("\n"));
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const kindStorageExtension = (kind: SourceDocumentKind): string => {
  switch (kind) {
    case "GOOGLE_DOC":
      return "txt";
    case "GOOGLE_SHEET":
      return "csv";
    case "PDF":
      return "pdf";
    case "CSV":
      return "csv";
    case "XLSX":
      return "xlsx";
  }
};

export const WorkspaceService = {
  async createRunWithFrozenSnapshots(input: {
    env: Env;
    projectId: string;
    userId: string;
    runType: RunType;
  }): Promise<{ runId: string; snapshotIds: string[]; snapshotHash: string | null; createdAt: string }> {
    const snapshotIds = await Db.listLatestSnapshotIdsForProjectOwned(
      input.env.ALEXCLAW_DB,
      input.projectId,
      input.userId
    );
    const snapshotHash = await computeInputSnapshotHash(snapshotIds);

    const run = await Db.createRun(input.env.ALEXCLAW_DB, {
      userId: input.userId,
      thesisId: input.projectId,
      runType: input.runType,
      contextStatus: "CURRENT",
      inputSnapshotHash: snapshotHash
    });

    for (const snapshotId of snapshotIds) {
      await Db.addRunInput(input.env.ALEXCLAW_DB, run.id, snapshotId);
    }

    await Db.addRunAuditEvent(input.env.ALEXCLAW_DB, {
      runId: run.id,
      eventType: "RUN_CREATED",
      detail: {
        runType: input.runType,
        snapshotCount: snapshotIds.length,
        snapshotHash
      }
    });

    return {
      runId: run.id,
      snapshotIds,
      snapshotHash,
      createdAt: run.created_at
    };
  },

  async syncProjectDocuments(input: {
    env: Env;
    projectId: string;
    userId: string;
  }): Promise<{
    syncEventId: string;
    imported: number;
    updatedSnapshots: number;
    staleRunsMarked: boolean;
  }> {
    const roots = await Db.getProjectDriveRootsOwned(input.env.ALEXCLAW_DB, input.projectId, input.userId);
    if (!roots) {
      throw new Error("PROJECT_DRIVE_ROOT_NOT_CONFIGURED");
    }

    const syncEvent = await Db.createSyncEvent(input.env.ALEXCLAW_DB, {
      projectId: input.projectId,
      userId: input.userId
    });

    try {
      const { accessToken } = await resolveGoogleAccessToken(input.env, input.userId);
      const client = buildGoogleDriveClient({ env: input.env, accessToken });
      const files = await client.listPullFiles(roots.pull_folder_id);

      let imported = 0;
      let updatedSnapshots = 0;
      for (const file of files) {
        const document = await Db.upsertSourceDocumentOwned(input.env.ALEXCLAW_DB, {
          projectId: input.projectId,
          userId: input.userId,
          googleFileId: file.id,
          kind: file.kind,
          title: file.name,
          mimeType: file.mimeType,
          includeInRuns: true
        });

        const bytes = await client.readFileContent(file.id, file.mimeType);
        const bounded = bytes.byteLength > maxSyncBytes ? bytes.slice(0, maxSyncBytes) : bytes;
        const checksum = await computeContentChecksum(bounded);
        const revisionRef = file.version || file.modifiedTime || checksum;
        const extension = kindStorageExtension(file.kind);
        const storageKey = `projects/${input.projectId}/snapshots/${document.id}/${revisionRef}.${extension}`;
        await Storage.putBytes(input.env, storageKey, bounded, file.mimeType || "application/octet-stream");

        const snapshot = await Db.createDocumentSnapshot(input.env.ALEXCLAW_DB, {
          sourceDocumentId: document.id,
          revisionRef,
          checksum,
          sizeBytes: bounded.byteLength,
          storageKey,
          metadata: {
            fileId: file.id,
            name: file.name,
            mimeType: file.mimeType,
            truncated: bytes.byteLength > maxSyncBytes
          }
        });

        imported += 1;
        if (snapshot.created) {
          updatedSnapshots += 1;
        }
      }

      const staleRunsMarked = updatedSnapshots > 0;
      if (staleRunsMarked) {
        await Db.markProjectRunsStale(input.env.ALEXCLAW_DB, input.projectId, input.userId);
      }

      await Db.completeSyncEvent(input.env.ALEXCLAW_DB, {
        syncEventId: syncEvent.id,
        status: "COMPLETED",
        summary: {
          imported,
          updatedSnapshots,
          staleRunsMarked
        }
      });

      return {
        syncEventId: syncEvent.id,
        imported,
        updatedSnapshots,
        staleRunsMarked
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await Db.completeSyncEvent(input.env.ALEXCLAW_DB, {
        syncEventId: syncEvent.id,
        status: "FAILED",
        error: message
      });
      throw error;
    }
  },

  async exportRunBundleToDrive(input: {
    env: Env;
    runId: string;
    projectId: string;
    userId: string;
    bundle: {
      manifest: unknown;
      sectionBundles: Array<{
        section: string;
        claims: string[];
        evidence: string[];
        gaps: string[];
        nextActions: string[];
      }>;
      auditEvents: unknown[];
    };
  }): Promise<void> {
    const roots = await Db.getProjectDriveRootsOwned(input.env.ALEXCLAW_DB, input.projectId, input.userId);
    if (!roots) {
      return;
    }

    const { accessToken } = await resolveGoogleAccessToken(input.env, input.userId);
    const client = buildGoogleDriveClient({ env: input.env, accessToken });
    const now = new Date();
    const prefix = `runs/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}/${input.runId}`;

    await client.uploadTextFile({
      parentFolderId: roots.push_folder_id,
      fileName: `${prefix.replace(/\//g, "_")}_manifest.json`,
      content: JSON.stringify(input.bundle.manifest, null, 2),
      mimeType: "application/json"
    });

    await client.uploadTextFile({
      parentFolderId: roots.push_folder_id,
      fileName: `${prefix.replace(/\//g, "_")}_section_bundles.json`,
      content: JSON.stringify(input.bundle.sectionBundles, null, 2),
      mimeType: "application/json"
    });

    await client.uploadTextFile({
      parentFolderId: roots.push_folder_id,
      fileName: `${prefix.replace(/\//g, "_")}_audit_events.ndjson`,
      content: input.bundle.auditEvents.map((item) => JSON.stringify(item)).join("\n"),
      mimeType: "application/x-ndjson"
    });
  },

  async postSectionCommentsToDesignatedDocs(input: {
    env: Env;
    runId: string;
    projectId: string;
    userId: string;
    sectionBundles: Array<{
      section: string;
      claims: string[];
      evidence: string[];
      gaps: string[];
      nextActions: string[];
    }>;
  }): Promise<void> {
    if (input.sectionBundles.length === 0) {
      return;
    }

    const docs = await Db.listDesignatedThesisDocsByRun(input.env.ALEXCLAW_DB, input.runId);
    if (docs.length === 0) {
      return;
    }

    const { accessToken } = await resolveGoogleAccessToken(input.env, input.userId);
    const client = buildGoogleDriveClient({ env: input.env, accessToken });

    for (const doc of docs) {
      for (const section of input.sectionBundles) {
        const commentContent = [
          `Run ${input.runId.slice(0, 8)} - Section: ${section.section}`,
          "",
          "Claims:",
          ...section.claims.map((claim) => `- ${claim}`),
          "",
          "Evidence:",
          ...section.evidence.map((evidence) => `- ${evidence}`),
          "",
          "Gaps:",
          ...section.gaps.map((gap) => `- ${gap}`),
          "",
          "Next actions:",
          ...section.nextActions.map((action) => `- ${action}`)
        ].join("\n").slice(0, 7000);

        try {
          const created = await client.postComment(doc.google_file_id, commentContent);
          await Db.addRunDocComment(input.env.ALEXCLAW_DB, {
            runId: input.runId,
            sourceDocumentId: doc.source_document_id,
            sectionLabel: section.section,
            googleCommentId: created.id,
            status: "POSTED"
          });
          await Db.addRunAuditEvent(input.env.ALEXCLAW_DB, {
            runId: input.runId,
            eventType: "COMMENT_POSTED",
            detail: {
              sourceDocumentId: doc.source_document_id,
              googleCommentId: created.id,
              section: section.section
            }
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await Db.addRunDocComment(input.env.ALEXCLAW_DB, {
            runId: input.runId,
            sourceDocumentId: doc.source_document_id,
            sectionLabel: section.section,
            status: "FAILED",
            error: message
          });
          await Db.addRunAuditEvent(input.env.ALEXCLAW_DB, {
            runId: input.runId,
            eventType: "COMMENT_FAILED",
            detail: {
              sourceDocumentId: doc.source_document_id,
              section: section.section,
              error: message
            }
          });
        }
      }
    }
  },

  decodeSnapshotText(bytes: Uint8Array): string {
    return decodeUtf8(bytes);
  }
};

import { Auth } from "../lib/auth.js";
import { Db } from "../lib/db.js";
import { Encrypt } from "../lib/crypto.js";
import { OAuth } from "../lib/oauth.js";
import { WorkspaceService } from "../lib/workspace-service.js";
import { json, safeJsonParse, type App } from "./shared.js";

const DRIVE_OAUTH_STATE_COOKIE = "drive_oauth_state";
const DRIVE_OAUTH_PROJECT_COOKIE = "drive_oauth_project";

const requireEncryptionKey = (env: { ENCRYPTION_KEY?: string }): string => {
  const key = env.ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error("ENCRYPTION_KEY is not configured");
  }
  return key;
};

export function registerProjectWorkspaceRoutes(app: App): void {
  app.get("/api/projects/:projectId/integrations/google", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const project = await Db.getThesisOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    const integration = await Db.getGoogleIntegrationByUser(c.env.ALEXCLAW_DB, user.id);
    const roots = await Db.getProjectDriveRootsOwned(c.env.ALEXCLAW_DB, projectId, user.id);

    return json({
      integration: integration
        ? {
            connected: true,
            accountEmail: integration.google_account_email,
            scopes: safeJsonParse<string[]>(integration.scopes_json, []),
            updatedAt: integration.updated_at
          }
        : {
            connected: false,
            accountEmail: null,
            scopes: [],
            updatedAt: null
          },
      root: roots
        ? {
            rootFolderId: roots.root_folder_id,
            pullFolderId: roots.pull_folder_id,
            pushFolderId: roots.push_folder_id,
            updatedAt: roots.updated_at
          }
        : null
    });
  });

  app.get("/api/projects/:projectId/integrations/google/connect", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!OAuth.isGoogleConfigured(c.env)) {
      return json({ error: "Google integration is not configured" }, 503);
    }

    const projectId = c.req.param("projectId");
    const project = await Db.getThesisOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    const state = Auth.randomToken();
    c.header(
      "Set-Cookie",
      Auth.toSetCookie({
        name: DRIVE_OAUTH_STATE_COOKIE,
        value: state,
        maxAge: 600,
        secure: true
      })
    );
    c.header(
      "Set-Cookie",
      Auth.toSetCookie({
        name: DRIVE_OAUTH_PROJECT_COOKIE,
        value: projectId,
        maxAge: 600,
        secure: true
      }),
      { append: true }
    );

    const callbackUrl = OAuth.resolveGoogleIntegrationCallbackUrl(c.req.url, projectId);
    const authorizationUrl = OAuth.buildGoogleDriveAuthorizationUrl(c.env, {
      state,
      callbackUrl
    });
    return c.redirect(authorizationUrl);
  });

  app.get("/api/projects/:projectId/integrations/google/callback", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!OAuth.isGoogleConfigured(c.env)) {
      return json({ error: "Google integration is not configured" }, 503);
    }

    const projectId = c.req.param("projectId");
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) {
      return json({ error: "Missing OAuth callback params" }, 400);
    }

    const cookies = Auth.parseCookies(c.req.header("cookie"));
    if (cookies[DRIVE_OAUTH_STATE_COOKIE] !== state || cookies[DRIVE_OAUTH_PROJECT_COOKIE] !== projectId) {
      return json({ error: "Invalid OAuth state" }, 400);
    }

    const callbackUrl = OAuth.resolveGoogleIntegrationCallbackUrl(c.req.url, projectId);

    try {
      const token = await OAuth.exchangeGoogleCode(c.env, {
        code,
        callbackUrl
      });
      const profile = await OAuth.fetchGoogleProfile(token.access_token);

      const encryptionKey = requireEncryptionKey(c.env);
      const encryptedAccess = await Encrypt.encrypt(encryptionKey, token.access_token);
      const encryptedRefresh = token.refresh_token
        ? await Encrypt.encrypt(encryptionKey, token.refresh_token)
        : null;

      const integration = await Db.upsertGoogleIntegration(c.env.ALEXCLAW_DB, {
        userId: user.id,
        googleAccountEmail: profile.email ?? null,
        scopes: (token.scope ?? "").split(/\s+/).filter(Boolean),
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : null
      });

      const existingRoot = await Db.getProjectDriveRootsOwned(c.env.ALEXCLAW_DB, projectId, user.id);
      if (!existingRoot) {
        await Db.upsertProjectDriveRootsOwned(c.env.ALEXCLAW_DB, {
          projectId,
          userId: user.id,
          googleIntegrationId: integration.id,
          rootFolderId: "",
          pullFolderId: "",
          pushFolderId: ""
        }).catch(() => undefined);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, 500);
    }

    c.header(
      "Set-Cookie",
      Auth.toSetCookie({
        name: DRIVE_OAUTH_STATE_COOKIE,
        value: "",
        maxAge: 0,
        secure: true
      }),
      { append: true }
    );
    c.header(
      "Set-Cookie",
      Auth.toSetCookie({
        name: DRIVE_OAUTH_PROJECT_COOKIE,
        value: "",
        maxAge: 0,
        secure: true
      }),
      { append: true }
    );

    return c.redirect(`/projects/${projectId}/documents`);
  });

  app.post("/api/projects/:projectId/integrations/google/root", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const projectId = c.req.param("projectId");
    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as {
      rootFolderId?: string;
      pullFolderId?: string;
      pushFolderId?: string;
    };

    const rootFolderId = body.rootFolderId?.trim() ?? "";
    const pullFolderId = body.pullFolderId?.trim() ?? "";
    const pushFolderId = body.pushFolderId?.trim() ?? "";
    if (!rootFolderId || !pullFolderId || !pushFolderId) {
      return json({ error: "rootFolderId, pullFolderId, and pushFolderId are required" }, 400);
    }

    const integration = await Db.getGoogleIntegrationByUser(c.env.ALEXCLAW_DB, user.id);
    if (!integration) {
      return json({ error: "Google integration is not connected" }, 400);
    }

    try {
      await Db.upsertProjectDriveRootsOwned(c.env.ALEXCLAW_DB, {
        projectId,
        userId: user.id,
        googleIntegrationId: integration.id,
        rootFolderId,
        pullFolderId,
        pushFolderId
      });
      return json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "PROJECT_NOT_FOUND") {
        return json({ error: "Project not found" }, 404);
      }
      if (message === "GOOGLE_INTEGRATION_NOT_FOUND") {
        return json({ error: "Google integration is not connected" }, 400);
      }
      return json({ error: message }, 500);
    }
  });

  app.post("/api/projects/:projectId/sync", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const projectId = c.req.param("projectId");
    const project = await Db.getThesisOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    try {
      const result = await WorkspaceService.syncProjectDocuments({
        env: c.env,
        projectId,
        userId: user.id
      });
      return json({ sync: result }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "PROJECT_DRIVE_ROOT_NOT_CONFIGURED") {
        return json({ error: "Project Drive root is not configured" }, 400);
      }
      return json({ error: message }, 500);
    }
  });

  app.get("/api/projects/:projectId/documents", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const projectId = c.req.param("projectId");
    const documents = await Db.listSourceDocumentsOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (documents.length === 0) {
      const project = await Db.getThesisOwned(c.env.ALEXCLAW_DB, projectId, user.id);
      if (!project) {
        return json({ error: "Project not found" }, 404);
      }
    }

    return json({
      documents: documents.map((doc) => ({
        id: doc.id,
        googleFileId: doc.google_file_id,
        kind: doc.kind,
        role: doc.role,
        title: doc.title,
        mimeType: doc.mime_type,
        includeInRuns: doc.include_in_runs === 1,
        isDesignatedThesisDoc: doc.is_designated_thesis_doc === 1,
        active: doc.active === 1,
        latestSnapshotId: doc.latest_snapshot_id,
        latestSnapshotCreatedAt: doc.latest_snapshot_created_at,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at
      }))
    });
  });

  app.patch("/api/projects/:projectId/documents/:documentId", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const projectId = c.req.param("projectId");
    const documentId = c.req.param("documentId");
    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as {
      role?: string | null;
      includeInRuns?: boolean;
      isDesignatedThesisDoc?: boolean;
      active?: boolean;
    };

    const updated = await Db.patchSourceDocumentOwned(c.env.ALEXCLAW_DB, {
      projectId,
      userId: user.id,
      documentId,
      role: body.role,
      includeInRuns: body.includeInRuns,
      isDesignatedThesisDoc: body.isDesignatedThesisDoc,
      active: body.active
    });
    if (!updated) {
      return json({ error: "Document not found" }, 404);
    }

    return json({ ok: true });
  });

  app.get("/api/projects/:projectId/documents/:documentId/snapshots", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const projectId = c.req.param("projectId");
    const documentId = c.req.param("documentId");

    const snapshots = await Db.listDocumentSnapshotsOwned(c.env.ALEXCLAW_DB, {
      projectId,
      userId: user.id,
      documentId
    });

    return json({
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        revisionRef: snapshot.revision_ref,
        checksum: snapshot.checksum,
        sizeBytes: Number(snapshot.size_bytes ?? 0),
        storageKey: snapshot.storage_key,
        metadata: safeJsonParse<Record<string, unknown> | null>(snapshot.metadata_json, null),
        createdAt: snapshot.created_at
      }))
    });
  });

  app.get("/api/projects/:projectId/runs", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");

    const runs = await Db.listProjectRunsOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    return json({
      runs: runs.map((run) => ({
        id: run.id,
        status: run.status,
        runType: run.run_type,
        contextStatus: run.context_status,
        inputSnapshotHash: run.input_snapshot_hash,
        error: run.error,
        createdAt: run.created_at,
        updatedAt: run.updated_at
      }))
    });
  });

  app.get("/api/projects/:projectId/runs/:runId", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const projectId = c.req.param("projectId");
    const runId = c.req.param("runId");
    const run = await Db.getProjectRunOwned(c.env.ALEXCLAW_DB, runId, projectId, user.id);
    if (!run) {
      return json({ error: "Run not found" }, 404);
    }

    const [inputs, steps, comments] = await Promise.all([
      Db.listRunInputSnapshotsOwned(c.env.ALEXCLAW_DB, runId, user.id),
      Db.listRunStepsOwned(c.env.ALEXCLAW_DB, runId, user.id),
      Db.listRunDocCommentsOwned(c.env.ALEXCLAW_DB, runId, user.id)
    ]);

    return json({
      run: {
        id: run.id,
        status: run.status,
        runType: run.run_type,
        contextStatus: run.context_status,
        inputSnapshotHash: run.input_snapshot_hash,
        error: run.error,
        createdAt: run.created_at,
        updatedAt: run.updated_at
      },
      inputs: inputs.map((snapshot) => ({
        snapshotId: snapshot.snapshot_id,
        sourceDocumentId: snapshot.source_document_id,
        documentTitle: snapshot.document_title,
        kind: snapshot.kind,
        revisionRef: snapshot.revision_ref,
        checksum: snapshot.checksum,
        createdAt: snapshot.created_at
      })),
      steps: steps.map((step) => ({
        id: step.id,
        name: step.step_name,
        status: step.status,
        attempt: step.attempt,
        startedAt: step.started_at,
        finishedAt: step.finished_at,
        error: step.error
      })),
      comments: comments.map((comment) => ({
        id: comment.id,
        sourceDocumentId: comment.source_document_id,
        sectionLabel: comment.section_label,
        googleCommentId: comment.google_comment_id,
        status: comment.status,
        error: comment.error,
        createdAt: comment.created_at
      }))
    });
  });

  app.get("/api/projects/:projectId/runs/:runId/audit", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const projectId = c.req.param("projectId");
    const runId = c.req.param("runId");
    const run = await Db.getProjectRunOwned(c.env.ALEXCLAW_DB, runId, projectId, user.id);
    if (!run) {
      return json({ error: "Run not found" }, 404);
    }

    const events = await Db.listRunAuditEventsOwned(c.env.ALEXCLAW_DB, runId, user.id);
    return json({
      events: events.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        detail: safeJsonParse<Record<string, unknown>>(event.detail_json, {}),
        createdAt: event.created_at
      }))
    });
  });

  app.get("/api/projects/:projectId/runs/:runId/artifacts", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const projectId = c.req.param("projectId");
    const runId = c.req.param("runId");
    const run = await Db.getProjectRunOwned(c.env.ALEXCLAW_DB, runId, projectId, user.id);
    if (!run) {
      return json({ error: "Run not found" }, 404);
    }

    const artifacts = await Db.listRunArtifactsOwned(c.env.ALEXCLAW_DB, runId, user.id);
    return json({
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        runId: artifact.run_id,
        artifactType: artifact.artifact_type,
        title: artifact.title,
        storageKey: artifact.storage_key,
        metadata: safeJsonParse<Record<string, unknown> | null>(artifact.metadata_json, null),
        createdAt: artifact.created_at
      }))
    });
  });
}

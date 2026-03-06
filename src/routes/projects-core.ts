import { Auth } from "../lib/auth.js";
import { Db } from "../lib/db.js";
import { HubDb } from "../lib/hub-db.js";
import { WorkspaceService } from "../lib/workspace-service.js";
import type { RunType } from "../lib/types.js";
import {
  MAX_THESIS_TEXT_LENGTH,
  MAX_MEMORY_DOC_CONTENT_LENGTH,
  MAX_MEMORY_DOC_KEY_LENGTH,
  MAX_MEMORY_DOC_TITLE_LENGTH,
  PROJECT_CREATE_MIN_INTERVAL_MS,
  RUN_CREATE_MIN_INTERVAL_MS,
} from "../app/constants.js";
import { json, type App } from "./shared.js";

const dispatchRun = async (
  db: D1Database,
  queue: Queue,
  runId: string
): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    await queue.send({ runId });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await Db.updateRunStatus(db, runId, "FAILED", `Run dispatch failed: ${message}`);
    return { ok: false, error: message };
  }
};
const MEMORY_DOC_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,63})$/;

const ensureByokConfigured = async (db: D1Database, userId: string): Promise<boolean> => {
  const credential = await Db.getResolvedUserLlmCredential(db, userId);
  return Boolean(credential);
};

const ensureResearchByokConfigured = async (
  db: D1Database,
  userId: string
): Promise<{ ok: boolean; missing: string[] }> => {
  const keys = await Db.listUserResearchApiKeys(db, userId);
  const configured = new Set(keys.map((key) => key.provider));
  const required: Array<"openalex" | "semantic_scholar"> = ["openalex", "semantic_scholar"];
  const missing = required.filter((provider) => !configured.has(provider));
  return { ok: missing.length === 0, missing };
};

export function registerProjectCoreRoutes(app: App): void {
  app.get("/api/projects", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projects = await HubDb.listProjectsByUser(c.env.ALEXCLAW_DB, user.id);
    return json({
      projects: projects.map((project) => ({
        id: project.id,
        title: project.title,
        createdAt: project.created_at,
        textPreview: project.text.slice(0, 180),
        latestRun: project.latest_run_id
          ? {
              id: project.latest_run_id,
              status: project.latest_run_status,
              runType: project.latest_run_type,
              contextStatus: project.latest_run_context_status,
              updatedAt: project.latest_run_updated_at
            }
          : null,
        counts: {
          papers: Number(project.paper_count ?? 0),
          readingList: Number(project.reading_count ?? 0),
          bookmarked: Number(project.bookmarked_count ?? 0),
          chats: Number(project.chat_count ?? 0)
        }
      }))
    });
  });

  app.get("/api/projects/:projectId", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const projectId = c.req.param("projectId");
    const project = await HubDb.getProjectOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }
    const latestRun = await HubDb.getProjectLatestRunOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    return json({
      project: {
        id: project.id,
        title: project.title,
        thesisText: project.text,
        createdAt: project.created_at,
        latestRun: latestRun
          ? {
              id: latestRun.id,
              status: latestRun.status,
              runType: latestRun.run_type,
              contextStatus: latestRun.context_status,
              inputSnapshotHash: latestRun.input_snapshot_hash,
              error: latestRun.error,
              updatedAt: latestRun.updated_at
            }
          : null
      }
    });
  });

  app.post("/api/projects", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const createThrottle = await Db.tryAcquireGlobalRateLimitWindow(
      c.env.ALEXCLAW_DB,
      `project_create:${user.id}`,
      PROJECT_CREATE_MIN_INTERVAL_MS
    );
    if (!createThrottle.allowed) {
      const response = json(
        { error: "Too many project create requests", retryAfterMs: createThrottle.retryAfterMs },
        429
      );
      response.headers.set("Retry-After", String(Math.max(1, Math.ceil(createThrottle.retryAfterMs / 1000))));
      return response;
    }

    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as { title?: string; thesisText?: string };
    const thesisText = body.thesisText?.trim();
    if (!thesisText || thesisText.length < 30) {
      return json({ error: "thesisText is required and must be at least 30 characters" }, 400);
    }
    if (thesisText.length > MAX_THESIS_TEXT_LENGTH) {
      return json({ error: `thesisText must be at most ${MAX_THESIS_TEXT_LENGTH} characters` }, 413);
    }

    const byokConfigured = await ensureByokConfigured(c.env.ALEXCLAW_DB, user.id);
    if (!byokConfigured) {
      return json(
        {
          error: "BYOK is required before creating projects. Configure a provider key in Account settings."
        },
        400
      );
    }
    const researchByok = await ensureResearchByokConfigured(c.env.ALEXCLAW_DB, user.id);
    if (!researchByok.ok) {
      return json(
        {
          error: `Research BYOK is required before creating projects. Missing: ${researchByok.missing.join(", ")}.`
        },
        400
      );
    }

    const project = await HubDb.createProject(c.env.ALEXCLAW_DB, {
      userId: user.id,
      title: body.title,
      thesisText
    });

    const runDraft = await WorkspaceService.createRunWithFrozenSnapshots({
      env: c.env,
      projectId: project.id,
      userId: user.id,
      runType: "RESEARCH"
    });
    const dispatched = await dispatchRun(c.env.ALEXCLAW_DB, c.env.ALEXCLAW_RUN_QUEUE, runDraft.runId);
    if (!dispatched.ok) {
      return json(
        {
          error: "Failed to dispatch run",
          project: {
            id: project.id,
            title: project.title,
            thesisText: project.text,
            createdAt: project.created_at
          },
          run: {
            id: runDraft.runId,
            status: "FAILED",
            error: "Run dispatch failed",
            createdAt: runDraft.createdAt
          }
        },
        503
      );
    }

    return json(
      {
        project: {
          id: project.id,
          title: project.title,
          thesisText: project.text,
          createdAt: project.created_at
        },
        run: {
          id: runDraft.runId,
          status: "QUEUED",
          runType: "RESEARCH",
          contextStatus: "CURRENT",
          inputSnapshotHash: runDraft.snapshotHash,
          createdAt: runDraft.createdAt
        }
      },
      201
    );
  });

  app.patch("/api/projects/:projectId", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const projectId = c.req.param("projectId");
    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as { title?: string; thesisText?: string };
    if (typeof body.title !== "string" && typeof body.thesisText !== "string") {
      return json({ error: "Provide title and/or thesisText" }, 400);
    }
    if (typeof body.thesisText === "string") {
      const trimmed = body.thesisText.trim();
      if (trimmed.length < 30) {
        return json({ error: "thesisText must be at least 30 characters" }, 400);
      }
      if (trimmed.length > MAX_THESIS_TEXT_LENGTH) {
        return json({ error: `thesisText must be at most ${MAX_THESIS_TEXT_LENGTH} characters` }, 413);
      }
    }

    const updated = await HubDb.updateProjectOwned(c.env.ALEXCLAW_DB, {
      projectId,
      userId: user.id,
      title: body.title,
      thesisText: body.thesisText?.trim()
    });
    if (!updated) {
      return json({ error: "Project not found" }, 404);
    }

    const project = await HubDb.getProjectOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    return json({
      project: {
        id: project!.id,
        title: project!.title,
        thesisText: project!.text,
        createdAt: project!.created_at
      }
    });
  });

  app.delete("/api/projects/:projectId", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const removed = await HubDb.deleteProjectOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!removed) {
      return json({ error: "Project not found" }, 404);
    }
    return json({ ok: true });
  });

  app.post("/api/projects/:projectId/runs", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const project = await HubDb.getProjectOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    const runThrottle = await Db.tryAcquireGlobalRateLimitWindow(
      c.env.ALEXCLAW_DB,
      `run_create:${user.id}`,
      RUN_CREATE_MIN_INTERVAL_MS
    );
    if (!runThrottle.allowed) {
      const response = json({ error: "Too many run requests", retryAfterMs: runThrottle.retryAfterMs }, 429);
      response.headers.set("Retry-After", String(Math.max(1, Math.ceil(runThrottle.retryAfterMs / 1000))));
      return response;
    }

    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as { runType?: RunType; snapshotPolicy?: string };
    const runType = body.runType ?? "RESEARCH";
    if (runType !== "RESEARCH" && runType !== "THESIS_ASSISTANT" && runType !== "DATASET_ANALYSIS") {
      return json({ error: "runType must be RESEARCH, THESIS_ASSISTANT, or DATASET_ANALYSIS" }, 400);
    }
    if (body.snapshotPolicy !== undefined && body.snapshotPolicy !== "LATEST_FROZEN") {
      return json({ error: "snapshotPolicy must be LATEST_FROZEN" }, 400);
    }
    const byokConfigured = await ensureByokConfigured(c.env.ALEXCLAW_DB, user.id);
    if (!byokConfigured) {
      return json({ error: "BYOK is required before creating runs. Configure Account settings first." }, 400);
    }
    const researchByok = await ensureResearchByokConfigured(c.env.ALEXCLAW_DB, user.id);
    if (!researchByok.ok) {
      return json(
        {
          error: `Research BYOK is required before creating runs. Missing: ${researchByok.missing.join(", ")}.`
        },
        400
      );
    }

    const runDraft = await WorkspaceService.createRunWithFrozenSnapshots({
      env: c.env,
      projectId,
      userId: user.id,
      runType
    });
    const dispatched = await dispatchRun(c.env.ALEXCLAW_DB, c.env.ALEXCLAW_RUN_QUEUE, runDraft.runId);
    if (!dispatched.ok) {
      return json(
        {
          error: "Failed to dispatch run",
          run: {
            id: runDraft.runId,
            status: "FAILED",
            error: "Run dispatch failed",
            runType,
            contextStatus: "CURRENT",
            inputSnapshotHash: runDraft.snapshotHash,
            createdAt: runDraft.createdAt
          }
        },
        503
      );
    }
    return json(
      {
        run: {
          id: runDraft.runId,
          status: "QUEUED",
          runType,
          contextStatus: "CURRENT",
          inputSnapshotHash: runDraft.snapshotHash,
          createdAt: runDraft.createdAt
        }
      },
      201
    );
  });

  app.get("/api/projects/:projectId/dashboard", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const dashboard = await HubDb.getProjectDashboardOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!dashboard) {
      return json({ error: "Project not found" }, 404);
    }
    return json({ dashboard });
  });

  app.get("/api/projects/:projectId/memory-docs", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const project = await HubDb.getProjectOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }
    const memoryDocs = await HubDb.listProjectMemoryDocsOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    return json({
      memoryDocs: memoryDocs.map((doc) => ({
        id: doc.id,
        key: doc.key,
        title: doc.title,
        content: doc.content,
        source: doc.source,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at
      }))
    });
  });

  app.patch("/api/projects/:projectId/memory-docs/:docKey", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const project = await HubDb.getProjectOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }
    const docKey = c.req.param("docKey").trim().toLowerCase();
    if (!docKey) {
      return json({ error: "docKey is required" }, 400);
    }
    if (docKey.length > MAX_MEMORY_DOC_KEY_LENGTH || !MEMORY_DOC_KEY_PATTERN.test(docKey)) {
      return json(
        {
          error:
            "docKey must be lowercase alphanumeric and may include '_' or '-', up to 64 characters"
        },
        400
      );
    }
    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as { title?: unknown; content?: unknown };
    if (typeof body.content !== "string") {
      return json({ error: "content is required" }, 400);
    }
    if (body.content.length > MAX_MEMORY_DOC_CONTENT_LENGTH) {
      return json({ error: `content must be at most ${MAX_MEMORY_DOC_CONTENT_LENGTH} characters` }, 413);
    }
    if (body.title !== undefined && typeof body.title !== "string") {
      return json({ error: "title must be a string" }, 400);
    }
    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    if (title && title.length > MAX_MEMORY_DOC_TITLE_LENGTH) {
      return json({ error: `title must be at most ${MAX_MEMORY_DOC_TITLE_LENGTH} characters` }, 413);
    }
    await HubDb.upsertProjectMemoryDoc(c.env.ALEXCLAW_DB, {
      projectId,
      key: docKey,
      title: title || docKey.replace(/_/g, " "),
      content: body.content,
      source: "manual"
    });
    return json({ ok: true });
  });
}

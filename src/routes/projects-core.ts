import { Auth } from "../lib/auth.js";
import { Db } from "../lib/db.js";
import { HubDb } from "../lib/hub-db.js";
import {
  MAX_THESIS_TEXT_LENGTH,
  RUN_CREATE_MIN_INTERVAL_MS,
  THESIS_CREATE_MIN_INTERVAL_MS
} from "../app/constants.js";
import { json, type App } from "./shared.js";

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
      THESIS_CREATE_MIN_INTERVAL_MS
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

    const project = await HubDb.createProject(c.env.ALEXCLAW_DB, {
      userId: user.id,
      title: body.title,
      thesisText
    });

    const run = await Db.createRun(c.env.ALEXCLAW_DB, {
      userId: user.id,
      thesisId: project.id
    });
    await c.env.ALEXCLAW_RUN_QUEUE.send({ runId: run.id });

    return json(
      {
        project: {
          id: project.id,
          title: project.title,
          thesisText: project.text,
          createdAt: project.created_at
        },
        run: {
          id: run.id,
          status: run.status,
          createdAt: run.created_at
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

    const run = await Db.createRun(c.env.ALEXCLAW_DB, {
      userId: user.id,
      thesisId: projectId
    });
    await c.env.ALEXCLAW_RUN_QUEUE.send({ runId: run.id });
    return json(
      {
        run: {
          id: run.id,
          status: run.status,
          createdAt: run.created_at
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
    const docKey = c.req.param("docKey").trim();
    if (!docKey) {
      return json({ error: "docKey is required" }, 400);
    }
    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as { title?: string; content?: string };
    const content = body.content?.trim();
    if (!content) {
      return json({ error: "content is required" }, 400);
    }
    await HubDb.upsertProjectMemoryDoc(c.env.ALEXCLAW_DB, {
      projectId,
      key: docKey,
      title: body.title?.trim() || docKey.replace(/_/g, " "),
      content,
      source: "manual"
    });
    return json({ ok: true });
  });
}

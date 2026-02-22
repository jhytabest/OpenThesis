import { Auth } from "../lib/auth.js";
import { HubDb } from "../lib/hub-db.js";
import {
  json,
  mapProjectPaperResponse,
  normalizeStringArray,
  queryBool,
  type App
} from "./shared.js";

export function registerProjectPaperRoutes(app: App): void {
  app.get("/api/projects/:projectId/papers", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const project = await HubDb.getProjectOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    const sortRaw = c.req.query("sort");
    const sort = sortRaw === "recent" || sortRaw === "citations" || sortRaw === "newest"
      ? sortRaw
      : "relevance";
    const tierRaw = c.req.query("tier");
    const tier = tierRaw === "FOUNDATIONAL" || tierRaw === "DEPTH" || tierRaw === "BACKGROUND"
      ? tierRaw
      : undefined;
    const limitParsed = Number(c.req.query("limit") ?? 200);
    const limit = Number.isFinite(limitParsed) ? limitParsed : 200;
    const offsetParsed = Number(c.req.query("offset") ?? 0);
    const offset = Number.isFinite(offsetParsed) ? offsetParsed : 0;

    const papers = await HubDb.listProjectPapersOwned(c.env.ALEXCLAW_DB, {
      projectId,
      userId: user.id,
      query: c.req.query("query"),
      sort,
      tier,
      oaOnly: queryBool(c.req.query("oaOnly")),
      bookmarkedOnly: queryBool(c.req.query("bookmarkedOnly")),
      readingOnly: queryBool(c.req.query("readingOnly")),
      includeDeleted: queryBool(c.req.query("includeDeleted")),
      limit,
      offset
    });

    return json({
      papers: papers.map(mapProjectPaperResponse)
    });
  });

  app.post("/api/projects/:projectId/papers", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const project = await HubDb.getProjectOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as {
      title?: string;
      abstract?: string;
      year?: number;
      doi?: string;
      citationCount?: number;
      fieldsOfStudy?: unknown;
      bookmarked?: boolean;
      inReadingList?: boolean;
      note?: string;
      tags?: unknown;
    };

    const title = body.title?.trim();
    if (!title) {
      return json({ error: "title is required" }, 400);
    }

    const created = await HubDb.addManualProjectPaper(c.env.ALEXCLAW_DB, {
      projectId,
      title,
      abstract: body.abstract,
      year: typeof body.year === "number" ? body.year : undefined,
      doi: body.doi,
      citationCount: typeof body.citationCount === "number" ? body.citationCount : undefined,
      fieldsOfStudy: normalizeStringArray(body.fieldsOfStudy),
      bookmarked: body.bookmarked,
      inReadingList: body.inReadingList,
      noteText: body.note,
      tags: normalizeStringArray(body.tags)
    });

    const paper = await HubDb.getProjectPaperOwned(c.env.ALEXCLAW_DB, {
      projectPaperId: created.id,
      projectId,
      userId: user.id
    });

    return json(
      {
        paper: mapProjectPaperResponse(paper!)
      },
      201
    );
  });

  app.patch("/api/projects/:projectId/papers/:projectPaperId", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const projectPaperId = c.req.param("projectPaperId");

    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as {
      title?: string;
      abstract?: string | null;
      year?: number | null;
      doi?: string | null;
      citationCount?: number | null;
      fieldsOfStudy?: unknown;
      bookmarked?: boolean;
      inReadingList?: boolean;
      note?: string | null;
      tags?: unknown;
      isDeleted?: boolean;
    };

    if (typeof body.title === "string" && !body.title.trim()) {
      return json({ error: "title cannot be empty" }, 400);
    }

    const updated = await HubDb.updateProjectPaperOwned(c.env.ALEXCLAW_DB, {
      projectPaperId,
      projectId,
      userId: user.id,
      patch: {
        title: body.title,
        abstract: body.abstract,
        year: body.year,
        doi: body.doi,
        citationCount: body.citationCount,
        fieldsOfStudy: Array.isArray(body.fieldsOfStudy) ? normalizeStringArray(body.fieldsOfStudy) : undefined,
        bookmarked: body.bookmarked,
        inReadingList: body.inReadingList,
        noteText: body.note,
        tags: Array.isArray(body.tags) ? normalizeStringArray(body.tags) : undefined,
        isDeleted: body.isDeleted
      }
    });

    if (!updated) {
      return json({ error: "Paper not found" }, 404);
    }

    return json({
      paper: mapProjectPaperResponse(updated)
    });
  });

  app.delete("/api/projects/:projectId/papers/:projectPaperId", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const projectPaperId = c.req.param("projectPaperId");
    const removed = await HubDb.softDeleteProjectPaperOwned(c.env.ALEXCLAW_DB, {
      projectId,
      projectPaperId,
      userId: user.id
    });
    if (!removed) {
      return json({ error: "Paper not found" }, 404);
    }
    return json({ ok: true });
  });

  app.get("/api/projects/:projectId/reading-list", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const project = await HubDb.getProjectOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    const papers = await HubDb.listProjectPapersOwned(c.env.ALEXCLAW_DB, {
      projectId,
      userId: user.id,
      sort: "relevance",
      readingOnly: true
    });
    return json({
      papers: papers.map(mapProjectPaperResponse)
    });
  });

  app.get("/api/projects/:projectId/papers/:projectPaperId/comments", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const projectPaperId = c.req.param("projectPaperId");
    const comments = await HubDb.listProjectPaperCommentsOwned(c.env.ALEXCLAW_DB, {
      projectId,
      projectPaperId,
      userId: user.id
    });
    return json({
      comments: comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at
      }))
    });
  });

  app.post("/api/projects/:projectId/papers/:projectPaperId/comments", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const projectPaperId = c.req.param("projectPaperId");
    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as { body?: string };
    const commentBody = body.body?.trim();
    if (!commentBody) {
      return json({ error: "body is required" }, 400);
    }
    const comment = await HubDb.createProjectPaperCommentOwned(c.env.ALEXCLAW_DB, {
      projectId,
      projectPaperId,
      userId: user.id,
      body: commentBody
    });
    if (!comment) {
      return json({ error: "Paper not found" }, 404);
    }
    return json(
      {
        comment: {
          id: comment.id,
          body: comment.body,
          createdAt: comment.created_at,
          updatedAt: comment.updated_at
        }
      },
      201
    );
  });

  app.delete("/api/projects/:projectId/papers/:projectPaperId/comments/:commentId", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const projectPaperId = c.req.param("projectPaperId");
    const commentId = c.req.param("commentId");
    const removed = await HubDb.deleteProjectPaperCommentOwned(c.env.ALEXCLAW_DB, {
      commentId,
      projectPaperId,
      projectId,
      userId: user.id
    });
    if (!removed) {
      return json({ error: "Comment not found" }, 404);
    }
    return json({ ok: true });
  });
}

import { Auth } from "../lib/auth.js";
import { HubDb } from "../lib/hub-db.js";
import {
  MAX_PAPER_ABSTRACT_LENGTH,
  MAX_PAPER_COMMENT_LENGTH,
  MAX_PAPER_DOI_LENGTH,
  MAX_PAPER_NOTE_LENGTH,
  MAX_PAPER_TAG_LENGTH,
  MAX_PAPER_TITLE_LENGTH
} from "../app/constants.js";
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

    const sortRaw = c.req.query("sort");
    const sort = sortRaw === "recent" || sortRaw === "citations" || sortRaw === "newest"
      ? sortRaw
      : "relevance";
    const limitParsed = Number(c.req.query("limit") ?? 200);
    const limit = Number.isFinite(limitParsed) ? limitParsed : 200;
    const offsetParsed = Number(c.req.query("offset") ?? 0);
    const offset = Number.isFinite(offsetParsed) ? offsetParsed : 0;

    const papers = await HubDb.listProjectPapersOwned(c.env.ALEXCLAW_DB, {
      projectId,
      userId: user.id,
      query: c.req.query("query"),
      sort,
      oaOnly: queryBool(c.req.query("oaOnly")),
      bookmarkedOnly: queryBool(c.req.query("bookmarkedOnly")),
      readingOnly: queryBool(c.req.query("readingOnly")),
      includeDeleted: queryBool(c.req.query("includeDeleted")),
      limit,
      offset
    });

    if (papers.length === 0) {
      const project = await HubDb.getProjectOwned(c.env.ALEXCLAW_DB, projectId, user.id);
      if (!project) {
        return json({ error: "Project not found" }, 404);
      }
    }

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
      comment?: string;
      note?: string;
      tags?: unknown;
    };

    const title = body.title?.trim();
    if (!title) {
      return json({ error: "title is required" }, 400);
    }
    if (title.length > MAX_PAPER_TITLE_LENGTH) {
      return json({ error: `title must be at most ${MAX_PAPER_TITLE_LENGTH} characters` }, 413);
    }
    const abstract = typeof body.abstract === "string" ? body.abstract.trim() : undefined;
    if (abstract && abstract.length > MAX_PAPER_ABSTRACT_LENGTH) {
      return json({ error: `abstract must be at most ${MAX_PAPER_ABSTRACT_LENGTH} characters` }, 413);
    }
    const doi = typeof body.doi === "string" ? body.doi.trim() : undefined;
    if (doi && doi.length > MAX_PAPER_DOI_LENGTH) {
      return json({ error: `doi must be at most ${MAX_PAPER_DOI_LENGTH} characters` }, 413);
    }
    const noteText =
      typeof body.comment === "string"
        ? body.comment.trim()
        : typeof body.note === "string"
          ? body.note.trim()
          : undefined;
    if (noteText && noteText.length > MAX_PAPER_NOTE_LENGTH) {
      return json({ error: `note/comment must be at most ${MAX_PAPER_NOTE_LENGTH} characters` }, 413);
    }
    if (
      typeof body.year === "number" &&
      (!Number.isInteger(body.year) || body.year < 1000 || body.year > 3000)
    ) {
      return json({ error: "year must be an integer between 1000 and 3000" }, 400);
    }
    if (
      typeof body.citationCount === "number" &&
      (!Number.isInteger(body.citationCount) || body.citationCount < 0)
    ) {
      return json({ error: "citationCount must be a non-negative integer" }, 400);
    }

    const created = await HubDb.addManualProjectPaper(c.env.ALEXCLAW_DB, {
      projectId,
      title,
      abstract,
      year: typeof body.year === "number" ? body.year : undefined,
      doi,
      citationCount: typeof body.citationCount === "number" ? body.citationCount : undefined,
      fieldsOfStudy: normalizeStringArray(body.fieldsOfStudy, 40, MAX_PAPER_TAG_LENGTH),
      bookmarked: body.bookmarked,
      inReadingList: body.inReadingList,
      noteText,
      tags: normalizeStringArray(body.tags, 40, MAX_PAPER_TAG_LENGTH)
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
      comment?: string | null;
      note?: string | null;
      tags?: unknown;
      isDeleted?: boolean;
    };

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return json({ error: "title cannot be empty" }, 400);
      }
      if (title.length > MAX_PAPER_TITLE_LENGTH) {
        return json({ error: `title must be at most ${MAX_PAPER_TITLE_LENGTH} characters` }, 413);
      }
    }
    if (typeof body.abstract === "string" && body.abstract.trim().length > MAX_PAPER_ABSTRACT_LENGTH) {
      return json({ error: `abstract must be at most ${MAX_PAPER_ABSTRACT_LENGTH} characters` }, 413);
    }
    if (typeof body.doi === "string" && body.doi.trim().length > MAX_PAPER_DOI_LENGTH) {
      return json({ error: `doi must be at most ${MAX_PAPER_DOI_LENGTH} characters` }, 413);
    }
    const patchNoteText =
      typeof body.comment === "string"
        ? body.comment.trim()
        : typeof body.note === "string"
          ? body.note.trim()
          : body.comment === null || body.note === null
            ? null
            : undefined;
    if (typeof patchNoteText === "string" && patchNoteText.length > MAX_PAPER_NOTE_LENGTH) {
      return json({ error: `note/comment must be at most ${MAX_PAPER_NOTE_LENGTH} characters` }, 413);
    }
    if (
      typeof body.year === "number" &&
      (!Number.isInteger(body.year) || body.year < 1000 || body.year > 3000)
    ) {
      return json({ error: "year must be an integer between 1000 and 3000" }, 400);
    }
    if (
      typeof body.citationCount === "number" &&
      (!Number.isInteger(body.citationCount) || body.citationCount < 0)
    ) {
      return json({ error: "citationCount must be a non-negative integer" }, 400);
    }

    const updated = await HubDb.updateProjectPaperOwned(c.env.ALEXCLAW_DB, {
      projectPaperId,
      projectId,
      userId: user.id,
      patch: {
        title: typeof body.title === "string" ? body.title.trim() : body.title,
        abstract: typeof body.abstract === "string" ? body.abstract.trim() : body.abstract,
        year: body.year,
        doi: typeof body.doi === "string" ? body.doi.trim() : body.doi,
        citationCount: body.citationCount,
        fieldsOfStudy: Array.isArray(body.fieldsOfStudy)
          ? normalizeStringArray(body.fieldsOfStudy, 40, MAX_PAPER_TAG_LENGTH)
          : undefined,
        bookmarked: body.bookmarked,
        inReadingList: body.inReadingList,
        noteText: patchNoteText,
        tags: Array.isArray(body.tags)
          ? normalizeStringArray(body.tags, 40, MAX_PAPER_TAG_LENGTH)
          : undefined,
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

    const papers = await HubDb.listProjectPapersOwned(c.env.ALEXCLAW_DB, {
      projectId,
      userId: user.id,
      sort: "relevance",
      readingOnly: true
    });
    if (papers.length === 0) {
      const project = await HubDb.getProjectOwned(c.env.ALEXCLAW_DB, projectId, user.id);
      if (!project) {
        return json({ error: "Project not found" }, 404);
      }
    }
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
    if (commentBody.length > MAX_PAPER_COMMENT_LENGTH) {
      return json({ error: `body must be at most ${MAX_PAPER_COMMENT_LENGTH} characters` }, 413);
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

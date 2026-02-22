import { Auth } from "../lib/auth.js";
import { HubDb } from "../lib/hub-db.js";
import { generateChatReply } from "../lib/chat-backend.js";
import { json, safeJsonParse, type App } from "./shared.js";

export function registerProjectChatRoutes(app: App): void {
  app.get("/api/projects/:projectId/chats", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const project = await HubDb.getProjectOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    const chats = await HubDb.listProjectChatsOwned(c.env.ALEXCLAW_DB, projectId, user.id);
    return json({
      chats: chats.map((chat) => ({
        id: chat.id,
        title: chat.title,
        createdAt: chat.created_at,
        updatedAt: chat.updated_at,
        messageCount: Number(chat.message_count ?? 0),
        lastMessageAt: chat.last_message_at
      }))
    });
  });

  app.post("/api/projects/:projectId/chats", async (c) => {
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
    const body = bodyRaw as { title?: string };
    const chat = await HubDb.createProjectChat(c.env.ALEXCLAW_DB, {
      projectId,
      userId: user.id,
      title: body.title
    });
    return json(
      {
        chat: {
          id: chat.id,
          title: chat.title,
          createdAt: chat.created_at,
          updatedAt: chat.updated_at
        }
      },
      201
    );
  });

  app.patch("/api/projects/:projectId/chats/:chatId", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const chatId = c.req.param("chatId");
    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as { title?: string };
    const title = body.title?.trim();
    if (!title) {
      return json({ error: "title is required" }, 400);
    }

    const renamed = await HubDb.renameProjectChatOwned(c.env.ALEXCLAW_DB, {
      projectId,
      chatId,
      userId: user.id,
      title
    });
    if (!renamed) {
      return json({ error: "Chat not found" }, 404);
    }
    return json({ ok: true });
  });

  app.delete("/api/projects/:projectId/chats/:chatId", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const chatId = c.req.param("chatId");
    const removed = await HubDb.deleteProjectChatOwned(c.env.ALEXCLAW_DB, {
      projectId,
      chatId,
      userId: user.id
    });
    if (!removed) {
      return json({ error: "Chat not found" }, 404);
    }
    return json({ ok: true });
  });

  app.get("/api/projects/:projectId/chats/:chatId/messages", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const chatId = c.req.param("chatId");
    const chat = await HubDb.getProjectChatOwned(c.env.ALEXCLAW_DB, chatId, projectId, user.id);
    if (!chat) {
      return json({ error: "Chat not found" }, 404);
    }

    const messages = await HubDb.listChatMessagesOwned(c.env.ALEXCLAW_DB, {
      projectId,
      chatId,
      userId: user.id
    });
    return json({
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        metadata: safeJsonParse<Record<string, unknown> | null>(message.metadata_json ?? null, null),
        createdAt: message.created_at
      }))
    });
  });

  app.post("/api/projects/:projectId/chats/:chatId/messages", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const projectId = c.req.param("projectId");
    const chatId = c.req.param("chatId");
    const chat = await HubDb.getProjectChatOwned(c.env.ALEXCLAW_DB, chatId, projectId, user.id);
    if (!chat) {
      return json({ error: "Chat not found" }, 404);
    }

    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as { content?: string };
    const content = body.content?.trim();
    if (!content) {
      return json({ error: "content is required" }, 400);
    }
    if (content.length > 20_000) {
      return json({ error: "content must be at most 20000 characters" }, 413);
    }

    const userMessage = await HubDb.createChatMessage(c.env.ALEXCLAW_DB, {
      chatId,
      projectId,
      userId: user.id,
      role: "user",
      content
    });

    await HubDb.appendProjectProgressMemory(c.env.ALEXCLAW_DB, {
      projectId,
      entry: content
    });

    const context = await HubDb.getProjectContextOwned(c.env.ALEXCLAW_DB, {
      projectId,
      userId: user.id,
      paperLimit: 30
    });
    if (!context) {
      return json({ error: "Project not found" }, 404);
    }

    const historyRows = await HubDb.listChatMessagesOwned(c.env.ALEXCLAW_DB, {
      projectId,
      chatId,
      userId: user.id
    });
    const history = historyRows.slice(-40).map((message) => ({
      role: message.role,
      content: message.content
    }));

    const assistantReply = await generateChatReply({
      env: c.env,
      projectId,
      chatId,
      projectTitle: context.project.title || `Project ${projectId.slice(0, 8)}`,
      userMessage: content,
      context,
      history
    });

    const assistantMessage = await HubDb.createChatMessage(c.env.ALEXCLAW_DB, {
      chatId,
      projectId,
      userId: user.id,
      role: "assistant",
      content: assistantReply.content,
      metadata: assistantReply.metadata
    });

    for (const doc of assistantReply.memoryDocs ?? []) {
      await HubDb.upsertProjectMemoryDoc(c.env.ALEXCLAW_DB, {
        projectId,
        key: doc.key,
        title: doc.title,
        content: doc.content,
        source: doc.source ?? "auto"
      });
    }

    return json(
      {
        messages: [
          {
            id: userMessage.id,
            role: userMessage.role,
            content: userMessage.content,
            createdAt: userMessage.created_at
          },
          {
            id: assistantMessage.id,
            role: assistantMessage.role,
            content: assistantMessage.content,
            createdAt: assistantMessage.created_at
          }
        ]
      },
      201
    );
  });
}

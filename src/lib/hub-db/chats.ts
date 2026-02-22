import { all, first, nowIso, run, runChanges } from "./base.js";

export const chatsRepo = {
  async createProjectChat(db: D1Database, input: {
    projectId: string;
    userId: string;
    title?: string;
  }): Promise<{ id: string; title: string; created_at: string; updated_at: string }> {
    const id = crypto.randomUUID();
    const now = nowIso();
    const title = input.title?.trim() || "New chat";
    await run(
      db,
      `INSERT INTO project_chats (id, project_id, user_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      input.projectId,
      input.userId,
      title,
      now,
      now
    );
    return { id, title, created_at: now, updated_at: now };
  },

  async listProjectChatsOwned(db: D1Database, projectId: string, userId: string): Promise<Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
    last_message_at: string | null;
  }>> {
    return all(
      db,
      `SELECT
         id,
         title,
         created_at,
         updated_at,
         message_count,
         last_message_at
       FROM project_chats
       WHERE project_id = ? AND user_id = ?
       ORDER BY last_message_at DESC, updated_at DESC`,
      projectId,
      userId
    );
  },

  async getProjectChatOwned(db: D1Database, chatId: string, projectId: string, userId: string): Promise<{
    id: string;
    project_id: string;
    user_id: string;
    title: string;
    created_at: string;
    updated_at: string;
  } | null> {
    return first(
      db,
      `SELECT id, project_id, user_id, title, created_at, updated_at
       FROM project_chats
       WHERE id = ? AND project_id = ? AND user_id = ?`,
      chatId,
      projectId,
      userId
    );
  },

  async renameProjectChatOwned(db: D1Database, input: {
    chatId: string;
    projectId: string;
    userId: string;
    title: string;
  }): Promise<boolean> {
    const changes = await runChanges(
      db,
      `UPDATE project_chats
       SET title = ?, updated_at = ?
       WHERE id = ? AND project_id = ? AND user_id = ?`,
      input.title.trim() || "Untitled chat",
      nowIso(),
      input.chatId,
      input.projectId,
      input.userId
    );
    return changes > 0;
  },

  async deleteProjectChatOwned(
    db: D1Database,
    input: { chatId: string; projectId: string; userId: string }
  ): Promise<boolean> {
    const changes = await runChanges(
      db,
      `DELETE FROM project_chats WHERE id = ? AND project_id = ? AND user_id = ?`,
      input.chatId,
      input.projectId,
      input.userId
    );
    return changes > 0;
  },

  async createChatMessage(db: D1Database, input: {
    chatId: string;
    projectId: string;
    userId: string;
    role: "user" | "assistant" | "system";
    content: string;
    metadata?: unknown;
  }): Promise<{ id: string; role: string; content: string; created_at: string }> {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    await run(
      db,
      `INSERT INTO chat_messages (id, chat_id, project_id, user_id, role, content, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.chatId,
      input.projectId,
      input.userId,
      input.role,
      input.content,
      input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt
    );
    await run(
      db,
      `UPDATE project_chats
       SET
         updated_at = ?,
         message_count = message_count + 1,
         last_message_at = CASE
           WHEN last_message_at IS NULL OR last_message_at < ? THEN ?
           ELSE last_message_at
         END
       WHERE id = ? AND project_id = ? AND user_id = ?`,
      createdAt,
      createdAt,
      createdAt,
      input.chatId,
      input.projectId,
      input.userId
    );
    return {
      id,
      role: input.role,
      content: input.content,
      created_at: createdAt
    };
  },

  async listChatMessagesOwned(db: D1Database, input: {
    chatId: string;
    projectId: string;
    userId: string;
  }): Promise<Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    metadata_json: string | null;
    created_at: string;
  }>> {
    return all(
      db,
      `SELECT m.id, m.role, m.content, m.metadata_json, m.created_at
       FROM chat_messages m
       INNER JOIN project_chats c ON c.id = m.chat_id
       WHERE m.chat_id = ? AND m.project_id = ? AND c.user_id = ?
       ORDER BY m.created_at ASC`,
      input.chatId,
      input.projectId,
      input.userId
    );
  },

  async listRecentChatMessagesOwned(db: D1Database, input: {
    chatId: string;
    projectId: string;
    userId: string;
    limit: number;
  }): Promise<Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    metadata_json: string | null;
    created_at: string;
  }>> {
    const limit = Math.max(1, Math.min(200, input.limit));
    return all(
      db,
      `SELECT m.id, m.role, m.content, m.metadata_json, m.created_at
       FROM chat_messages m
       INNER JOIN project_chats c ON c.id = m.chat_id
       WHERE m.chat_id = ? AND m.project_id = ? AND c.user_id = ?
       ORDER BY m.created_at DESC
       LIMIT ?`,
      input.chatId,
      input.projectId,
      input.userId,
      limit
    );
  }
};

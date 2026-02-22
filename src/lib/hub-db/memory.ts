import { all, first, nowIso, run } from "./base.js";

export const memoryRepo = {
  async upsertProjectMemoryDoc(db: D1Database, input: {
    projectId: string;
    key: string;
    title: string;
    content: string;
    source: "auto" | "manual" | "system";
  }): Promise<void> {
    const now = nowIso();
    await run(
      db,
      `INSERT INTO project_memory_docs (id, project_id, doc_key, title, content, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, doc_key) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         source = excluded.source,
         updated_at = excluded.updated_at`,
      crypto.randomUUID(),
      input.projectId,
      input.key,
      input.title,
      input.content,
      input.source,
      now,
      now
    );
  },

  async appendProjectProgressMemory(db: D1Database, input: {
    projectId: string;
    entry: string;
  }): Promise<void> {
    const cleanEntry = input.entry.replace(/\s+/g, " ").trim().slice(0, 1200);
    if (!cleanEntry) {
      return;
    }
    const existing = await first<{ content: string }>(
      db,
      `SELECT content
       FROM project_memory_docs
       WHERE project_id = ? AND doc_key = 'progress_log'`,
      input.projectId
    );
    const stamped = `- ${new Date().toISOString()}: ${cleanEntry}`;
    const nextContent = existing?.content ? `${existing.content}\n${stamped}` : stamped;
    const bounded = nextContent.length > 30_000
      ? nextContent.slice(nextContent.length - 30_000)
      : nextContent;
    await this.upsertProjectMemoryDoc(db, {
      projectId: input.projectId,
      key: "progress_log",
      title: "Progress log",
      content: bounded,
      source: "auto"
    });
  },

  async listProjectMemoryDocsOwned(db: D1Database, projectId: string, userId: string): Promise<Array<{
    id: string;
    key: string;
    title: string;
    content: string;
    source: "auto" | "manual" | "system";
    created_at: string;
    updated_at: string;
  }>> {
    return all(
      db,
      `SELECT
         m.id,
         m.doc_key AS key,
         m.title,
         m.content,
         m.source,
         m.created_at,
         m.updated_at
       FROM project_memory_docs m
       INNER JOIN theses t ON t.id = m.project_id
       WHERE m.project_id = ? AND t.user_id = ?
       ORDER BY m.updated_at DESC`,
      projectId,
      userId
    );
  }
};

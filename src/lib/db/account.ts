import type { SessionUser } from "../types.js";
import { all, first, nowIso, run, runChanges } from "./base.js";

export const accountRepo = {
  async createOrUpdateGoogleUser(db: D1Database, input: {
    googleSub: string;
    email: string;
    name: string;
  }): Promise<SessionUser> {
    const existingBySub = await first<{ id: string }>(
      db,
      `SELECT id FROM users WHERE google_sub = ?`,
      input.googleSub
    );

    if (existingBySub) {
      try {
        await run(
          db,
          `UPDATE users SET email = ?, name = ? WHERE id = ?`,
          input.email,
          input.name,
          existingBySub.id
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("UNIQUE constraint failed: users.email")) {
          throw new Error("EMAIL_ALREADY_IN_USE");
        }
        throw error;
      }
      const user = await first<SessionUser>(
        db,
        `SELECT id, email, name FROM users WHERE id = ?`,
        existingBySub.id
      );
      if (!user) {
        throw new Error("Failed to load updated Google user");
      }
      return user;
    }

    const id = crypto.randomUUID();
    try {
      await run(
        db,
        `INSERT INTO users (id, email, name, google_sub, created_at) VALUES (?, ?, ?, ?, ?)`,
        id,
        input.email,
        input.name,
        input.googleSub,
        nowIso()
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("UNIQUE constraint failed: users.email")) {
        throw new Error("EMAIL_ALREADY_IN_USE");
      }
      throw error;
    }

    return {
      id,
      email: input.email,
      name: input.name
    };
  },

  async createSession(db: D1Database, input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void> {
    await run(
      db,
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      input.userId,
      input.tokenHash,
      input.expiresAt,
      nowIso()
    );
  },

  async getSessionUser(db: D1Database, tokenHash: string): Promise<SessionUser | null> {
    return first<SessionUser>(
      db,
      `SELECT u.id, u.email, u.name
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      tokenHash,
      nowIso()
    );
  },

  async deleteSession(db: D1Database, tokenHash: string): Promise<void> {
    await run(db, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash);
  },

  async createThesis(db: D1Database, input: {
    userId: string;
    text: string;
  }): Promise<{ id: string; title: string | null; created_at: string }> {
    const id = crypto.randomUUID();
    const created = nowIso();
    await run(
      db,
      `INSERT INTO theses (id, user_id, text, created_at) VALUES (?, ?, ?, ?)`,
      id,
      input.userId,
      input.text,
      created
    );
    return {
      id,
      title: null,
      created_at: created
    };
  },

  async updateThesisTitleOwned(db: D1Database, input: {
    thesisId: string;
    userId: string;
    title: string;
  }): Promise<boolean> {
    const changes = await runChanges(
      db,
      `UPDATE theses SET title = ? WHERE id = ? AND user_id = ?`,
      input.title,
      input.thesisId,
      input.userId
    );
    return changes > 0;
  },

  async listThesesByUser(db: D1Database, userId: string): Promise<Array<{
    id: string;
    title: string | null;
    text: string;
    created_at: string;
  }>> {
    return all(
      db,
      `SELECT id, title, text, created_at FROM theses WHERE user_id = ? ORDER BY created_at DESC`,
      userId
    );
  },

  async getThesisOwned(db: D1Database, thesisId: string, userId: string): Promise<{
    id: string;
    title: string | null;
    text: string;
    created_at: string;
  } | null> {
    return first(
      db,
      `SELECT id, title, text, created_at FROM theses WHERE id = ? AND user_id = ?`,
      thesisId,
      userId
    );
  }
};

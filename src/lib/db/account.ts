import type { ByokProvider, SessionUser } from "../types.js";
import { first, nowIso, run, runChanges } from "./base.js";

export const accountRepo = {
  async createOrUpdateGoogleUser(db: D1Database, input: {
    googleSub: string;
    email: string;
    name: string;
  }): Promise<SessionUser> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existingBySub = await first<{ user_id: string }>(
      db,
      `SELECT user_id FROM auth_identities WHERE provider = 'google' AND provider_subject = ?`,
      input.googleSub
    );

    if (existingBySub) {
      try {
        await run(
          db,
          `UPDATE users SET email = ?, name = ?, google_sub = ? WHERE id = ?`,
          normalizedEmail,
          input.name,
          input.googleSub,
          existingBySub.user_id
        );
        await run(
          db,
          `UPDATE auth_identities
           SET email = ?, updated_at = ?
           WHERE provider = 'google' AND provider_subject = ?`,
          normalizedEmail,
          nowIso(),
          input.googleSub
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
        existingBySub.user_id
      );
      if (!user) {
        throw new Error("Failed to load updated Google user");
      }
      return user;
    }

    const existingByEmail = await first<{ id: string }>(
      db,
      `SELECT id FROM users WHERE lower(email) = lower(?)`,
      normalizedEmail
    );
    const id = existingByEmail?.id ?? crypto.randomUUID();
    try {
      if (existingByEmail) {
        await run(
          db,
          `UPDATE users SET email = ?, name = ?, google_sub = ? WHERE id = ?`,
          normalizedEmail,
          input.name,
          input.googleSub,
          id
        );
      } else {
        await run(
          db,
          `INSERT INTO users (id, email, name, google_sub, created_at) VALUES (?, ?, ?, ?, ?)`,
          id,
          normalizedEmail,
          input.name,
          input.googleSub,
          nowIso()
        );
      }
      await run(
        db,
        `INSERT INTO auth_identities (
           id, user_id, provider, provider_subject, email, created_at, updated_at)
         VALUES (?, ?, 'google', ?, ?, ?, ?)
         ON CONFLICT(provider, provider_subject) DO UPDATE SET
           user_id = excluded.user_id,
           email = excluded.email,
           updated_at = excluded.updated_at`,
        crypto.randomUUID(),
        id,
        input.googleSub,
        normalizedEmail,
        nowIso(),
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
      email: normalizedEmail,
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

  async upsertUserApiKey(db: D1Database, input: {
    userId: string;
    provider: ByokProvider;
    encryptedKey: string;
    model?: string | null;
    keyHint?: string | null;
  }): Promise<void> {
    const now = nowIso();
    await run(
      db,
      `INSERT INTO user_api_keys (id, user_id, provider, encrypted_key, key_hint, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         encrypted_key = excluded.encrypted_key,
         key_hint = excluded.key_hint,
         model = excluded.model,
         updated_at = excluded.updated_at`,
      crypto.randomUUID(),
      input.userId,
      input.provider,
      input.encryptedKey,
      input.keyHint ?? null,
      input.model ?? null,
      now,
      now
    );
  },

  async listUserApiKeys(db: D1Database, userId: string): Promise<Array<{
    provider: ByokProvider;
    encrypted_key: string;
    key_hint: string | null;
    model: string | null;
    updated_at: string;
  }>> {
    const result = await db.prepare(
      `SELECT provider, encrypted_key, key_hint, model, updated_at
       FROM user_api_keys
       WHERE user_id = ?
       ORDER BY updated_at DESC`
    ).bind(userId).all();
    return (result.results ?? []) as Array<{
      provider: ByokProvider;
      encrypted_key: string;
      key_hint: string | null;
      model: string | null;
      updated_at: string;
    }>;
  },

  async getUserApiKey(db: D1Database, userId: string, provider: ByokProvider): Promise<{
    provider: ByokProvider;
    encrypted_key: string;
    key_hint: string | null;
    model: string | null;
    updated_at: string;
  } | null> {
    return first(
      db,
      `SELECT provider, encrypted_key, key_hint, model, updated_at
       FROM user_api_keys
       WHERE user_id = ? AND provider = ?`,
      userId,
      provider
    );
  },

  async updateUserApiKeyModel(db: D1Database, input: {
    userId: string;
    provider: ByokProvider;
    model: string | null;
  }): Promise<boolean> {
    const changes = await runChanges(
      db,
      `UPDATE user_api_keys SET model = ?, updated_at = ? WHERE user_id = ? AND provider = ?`,
      input.model,
      nowIso(),
      input.userId,
      input.provider
    );
    return changes > 0;
  },

  async deleteUserApiKey(db: D1Database, input: { userId: string; provider: ByokProvider }): Promise<void> {
    await run(db, `DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?`, input.userId, input.provider);
  },

  async deleteAllUserApiKeys(db: D1Database, userId: string): Promise<void> {
    await run(db, `DELETE FROM user_api_keys WHERE user_id = ?`, userId);
  },

  async getUserLlmSettings(db: D1Database, userId: string): Promise<{
    active_provider: ByokProvider | null;
    active_model: string | null;
    updated_at: string;
  } | null> {
    return first(
      db,
      `SELECT active_provider, active_model, updated_at
       FROM user_llm_settings
       WHERE user_id = ?`,
      userId
    );
  },

  async upsertUserLlmSettings(db: D1Database, input: {
    userId: string;
    activeProvider: ByokProvider;
    activeModel: string | null;
  }): Promise<void> {
    const now = nowIso();
    await run(
      db,
      `INSERT INTO user_llm_settings (id, user_id, active_provider, active_model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         active_provider = excluded.active_provider,
         active_model = excluded.active_model,
         updated_at = excluded.updated_at`,
      crypto.randomUUID(),
      input.userId,
      input.activeProvider,
      input.activeModel,
      now,
      now
    );
  },

  async clearUserLlmSettings(db: D1Database, userId: string): Promise<void> {
    await run(db, `DELETE FROM user_llm_settings WHERE user_id = ?`, userId);
  },

  async getResolvedUserLlmCredential(db: D1Database, userId: string): Promise<{
    provider: ByokProvider;
    encrypted_key: string;
    key_hint: string | null;
    model: string | null;
    updated_at: string;
  } | null> {
    const settings = await first<{
      active_provider: ByokProvider | null;
      active_model: string | null;
    }>(
      db,
      `SELECT active_provider, active_model
       FROM user_llm_settings
       WHERE user_id = ?`,
      userId
    );

    if (settings?.active_provider) {
      const active = await first<{
        provider: ByokProvider;
        encrypted_key: string;
        key_hint: string | null;
        model: string | null;
        updated_at: string;
      }>(
        db,
        `SELECT provider, encrypted_key, key_hint, model, updated_at
         FROM user_api_keys
         WHERE user_id = ? AND provider = ?`,
        userId,
        settings.active_provider
      );
      if (active) {
        return {
          ...active,
          model: settings.active_model ?? active.model
        };
      }
    }

    return first(
      db,
      `SELECT provider, encrypted_key, key_hint, model, updated_at
       FROM user_api_keys
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
      userId
    );
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

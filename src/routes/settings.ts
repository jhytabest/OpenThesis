import { Auth } from "../lib/auth.js";
import {
  BYOK_DEFAULT_MODELS,
  BYOK_PROVIDERS,
  isByokProvider,
  isResearchApiProvider
} from "../lib/byok.js";
import { Db } from "../lib/db.js";
import { Encrypt } from "../lib/crypto.js";
import type { ByokProvider, ResearchApiProvider } from "../lib/types.js";
import { json, type App } from "./shared.js";

const requireEncryptionKey = (env: { ENCRYPTION_KEY?: string }): string => {
  const key = env.ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error("ENCRYPTION_KEY is not configured");
  }
  return key;
};

export function registerSettingsRoutes(app: App): void {
  app.get("/api/settings/byok", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const keys = await Db.listUserApiKeys(c.env.ALEXCLAW_DB, user.id);
    const settings = await Db.getUserLlmSettings(c.env.ALEXCLAW_DB, user.id);
    const providers: Record<ByokProvider, {
      configured: boolean;
      keyHint: string | null;
      model: string | null;
      updatedAt: string | null;
    }> = {
      openai: { configured: false, keyHint: null, model: null, updatedAt: null },
      openrouter: { configured: false, keyHint: null, model: null, updatedAt: null },
      gemini: { configured: false, keyHint: null, model: null, updatedAt: null },
      claude: { configured: false, keyHint: null, model: null, updatedAt: null }
    };
    for (const key of keys) {
      providers[key.provider] = {
        configured: true,
        keyHint: key.key_hint,
        model: key.model ?? null,
        updatedAt: key.updated_at
      };
    }

    const activeProvider = settings?.active_provider
      ? (providers[settings.active_provider]?.configured ? settings.active_provider : null)
      : null;
    const fallbackProvider = activeProvider ??
      keys.find((key) => BYOK_PROVIDERS.includes(key.provider))?.provider ??
      null;
    const fallbackModel = fallbackProvider
      ? (settings?.active_model ?? providers[fallbackProvider].model ?? BYOK_DEFAULT_MODELS[fallbackProvider])
      : null;

    return json({
      byok: {
        activeProvider: fallbackProvider,
        activeModel: fallbackModel,
        providers
      }
    });
  });

  app.put("/api/settings/byok", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as {
      provider?: string;
      apiKey?: string;
      model?: string | null;
      setActive?: boolean;
    };
    if (!isByokProvider(body.provider)) {
      return json({ error: "provider must be one of: openai, openrouter, gemini, claude" }, 400);
    }
    const provider = body.provider;
    const apiKey = body.apiKey?.trim() ?? "";
    const hasApiKey = apiKey.length > 0;
    if (hasApiKey && apiKey.length < 16) {
      return json({ error: "apiKey is invalid" }, 400);
    }
    const model = typeof body.model === "string" ? body.model.trim() : "";
    const normalizedModel = model ? model.slice(0, 160) : null;
    const setActive = body.setActive !== false;
    if (!hasApiKey && !setActive && normalizedModel === null) {
      return json({ error: "Nothing to update" }, 400);
    }

    try {
      if (hasApiKey) {
        const encrypted = await Encrypt.encrypt(requireEncryptionKey(c.env), apiKey);
        const hint = apiKey.length >= 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "configured";
        await Db.upsertUserApiKey(c.env.ALEXCLAW_DB, {
          userId: user.id,
          provider,
          encryptedKey: encrypted,
          model: normalizedModel,
          keyHint: hint
        });
      } else if (normalizedModel !== null) {
        const updated = await Db.updateUserApiKeyModel(c.env.ALEXCLAW_DB, {
          userId: user.id,
          provider,
          model: normalizedModel
        });
        if (!updated) {
          return json({ error: `No key configured for provider ${provider}` }, 400);
        }
      }

      if (setActive) {
        const activeRecord = await Db.getUserApiKey(c.env.ALEXCLAW_DB, user.id, provider);
        if (!activeRecord) {
          return json({ error: `No key configured for provider ${provider}` }, 400);
        }
        await Db.upsertUserLlmSettings(c.env.ALEXCLAW_DB, {
          userId: user.id,
          activeProvider: provider,
          activeModel: normalizedModel ?? activeRecord.model ?? BYOK_DEFAULT_MODELS[provider]
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, 500);
    }

    return json({ ok: true });
  });

  app.delete("/api/settings/byok", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as { provider?: string };
    if (isByokProvider(body.provider)) {
      await Db.deleteUserApiKey(c.env.ALEXCLAW_DB, {
        userId: user.id,
        provider: body.provider
      });
      const settings = await Db.getUserLlmSettings(c.env.ALEXCLAW_DB, user.id);
      if (settings?.active_provider === body.provider) {
        const remaining = await Db.listUserApiKeys(c.env.ALEXCLAW_DB, user.id);
        const next = remaining[0];
        if (next) {
          await Db.upsertUserLlmSettings(c.env.ALEXCLAW_DB, {
            userId: user.id,
            activeProvider: next.provider,
            activeModel: next.model ?? BYOK_DEFAULT_MODELS[next.provider]
          });
        } else {
          await Db.clearUserLlmSettings(c.env.ALEXCLAW_DB, user.id);
        }
      }
    } else {
      await Db.deleteAllUserApiKeys(c.env.ALEXCLAW_DB, user.id);
      await Db.clearUserLlmSettings(c.env.ALEXCLAW_DB, user.id);
    }
    return json({ ok: true });
  });

  app.get("/api/settings/research-keys", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const keys = await Db.listUserResearchApiKeys(c.env.ALEXCLAW_DB, user.id);
    const providers: Record<ResearchApiProvider, {
      configured: boolean;
      keyHint: string | null;
      updatedAt: string | null;
    }> = {
      openalex: { configured: false, keyHint: null, updatedAt: null },
      semantic_scholar: { configured: false, keyHint: null, updatedAt: null }
    };
    for (const key of keys) {
      providers[key.provider] = {
        configured: true,
        keyHint: key.key_hint,
        updatedAt: key.updated_at
      };
    }

    return json({ researchKeys: { providers } });
  });

  app.put("/api/settings/research-keys", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as {
      provider?: string;
      apiKey?: string;
    };
    if (!isResearchApiProvider(body.provider)) {
      return json({ error: "provider must be one of: openalex, semantic_scholar" }, 400);
    }
    const apiKey = body.apiKey?.trim() ?? "";
    if (apiKey.length < 16) {
      return json({ error: "apiKey is invalid" }, 400);
    }

    try {
      const encrypted = await Encrypt.encrypt(requireEncryptionKey(c.env), apiKey);
      const hint = `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
      await Db.upsertUserResearchApiKey(c.env.ALEXCLAW_DB, {
        userId: user.id,
        provider: body.provider,
        encryptedKey: encrypted,
        keyHint: hint
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, 500);
    }

    return json({ ok: true });
  });

  app.delete("/api/settings/research-keys", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as { provider?: string };
    if (isResearchApiProvider(body.provider)) {
      await Db.deleteUserResearchApiKey(c.env.ALEXCLAW_DB, {
        userId: user.id,
        provider: body.provider
      });
    } else {
      await Db.deleteAllUserResearchApiKeys(c.env.ALEXCLAW_DB, user.id);
    }
    return json({ ok: true });
  });
}

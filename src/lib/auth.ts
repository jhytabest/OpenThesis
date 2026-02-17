import type { Context } from "hono";
import { Db } from "./db.js";
import type { Env, SessionUser } from "./types.js";

const textEncoder = new TextEncoder();

const asBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value == null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const parseTtlDays = (value: string | undefined): number => {
  const parsed = Number(value ?? "30");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
};

const sessionCookieName = (env: Env): string => env.SESSION_COOKIE_NAME ?? "sid";

const sessionCookieSecure = (env: Env): boolean => asBool(env.SESSION_SECURE_COOKIES, true);

const parseCookies = (cookieHeader: string | null | undefined): Record<string, string> => {
  if (!cookieHeader) {
    return {};
  }
  const pairs = cookieHeader.split(";");
  const output: Record<string, string> = {};
  for (const pair of pairs) {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (!rawKey) {
      continue;
    }
    output[rawKey] = decodeURIComponent(rawValue.join("=") ?? "");
  }
  return output;
};

const toSetCookie = (input: {
  name: string;
  value: string;
  expires?: Date;
  maxAge?: number;
  secure: boolean;
}): string => {
  const parts = [`${input.name}=${encodeURIComponent(input.value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (input.secure) {
    parts.push("Secure");
  }
  if (input.expires) {
    parts.push(`Expires=${input.expires.toUTCString()}`);
  }
  if (typeof input.maxAge === "number") {
    parts.push(`Max-Age=${input.maxAge}`);
  }
  return parts.join("; ");
};

const hashToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const randomToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const Auth = {
  async createSessionCookie(c: Context<{ Bindings: Env }>, userId: string): Promise<void> {
    const token = randomToken();
    const tokenHash = await hashToken(token);
    const ttlDays = parseTtlDays(c.env.SESSION_TTL_DAYS);
    const expires = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await Db.createSession(c.env.ALEXCLAW_DB, {
      userId,
      tokenHash,
      expiresAt: expires.toISOString()
    });

    c.header(
      "Set-Cookie",
      toSetCookie({
        name: sessionCookieName(c.env),
        value: token,
        expires,
        secure: sessionCookieSecure(c.env)
      })
    );
  },

  clearSessionCookie(c: Context<{ Bindings: Env }>): void {
    c.header(
      "Set-Cookie",
      toSetCookie({
        name: sessionCookieName(c.env),
        value: "",
        maxAge: 0,
        secure: sessionCookieSecure(c.env)
      })
    );
  },

  async resolveUser(c: Context<{ Bindings: Env }>): Promise<SessionUser | null> {
    const cookies = parseCookies(c.req.header("cookie"));
    const token = cookies[sessionCookieName(c.env)];
    if (!token) {
      return null;
    }
    const tokenHash = await hashToken(token);
    return Db.getSessionUser(c.env.ALEXCLAW_DB, tokenHash);
  },

  async deleteSession(c: Context<{ Bindings: Env }>): Promise<void> {
    const cookies = parseCookies(c.req.header("cookie"));
    const token = cookies[sessionCookieName(c.env)];
    if (!token) {
      return;
    }
    const tokenHash = await hashToken(token);
    await Db.deleteSession(c.env.ALEXCLAW_DB, tokenHash);
  },

  parseCookies,
  toSetCookie,
  hashToken,
  randomToken,
  isDevAuthEnabled(env: Env): boolean {
    return asBool(env.ENABLE_DEV_AUTH, false);
  }
};

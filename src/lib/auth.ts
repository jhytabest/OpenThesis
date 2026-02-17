import type { Context } from "hono";
import { Db } from "./db.js";
import type { Env, SessionUser } from "./types.js";

const textEncoder = new TextEncoder();
const SESSION_COOKIE_NAME = "sid";
const SESSION_TTL_DAYS = 30;
const SESSION_COOKIE_SECURE = true;

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
    const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await Db.createSession(c.env.ALEXCLAW_DB, {
      userId,
      tokenHash,
      expiresAt: expires.toISOString()
    });

    c.header(
      "Set-Cookie",
      toSetCookie({
        name: SESSION_COOKIE_NAME,
        value: token,
        expires,
        secure: SESSION_COOKIE_SECURE
      })
    );
  },

  clearSessionCookie(c: Context<{ Bindings: Env }>): void {
    c.header(
      "Set-Cookie",
      toSetCookie({
        name: SESSION_COOKIE_NAME,
        value: "",
        maxAge: 0,
        secure: SESSION_COOKIE_SECURE
      })
    );
  },

  async resolveUser(c: Context<{ Bindings: Env }>): Promise<SessionUser | null> {
    const cookies = parseCookies(c.req.header("cookie"));
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) {
      return null;
    }
    const tokenHash = await hashToken(token);
    return Db.getSessionUser(c.env.ALEXCLAW_DB, tokenHash);
  },

  async deleteSession(c: Context<{ Bindings: Env }>): Promise<void> {
    const cookies = parseCookies(c.req.header("cookie"));
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) {
      return;
    }
    const tokenHash = await hashToken(token);
    await Db.deleteSession(c.env.ALEXCLAW_DB, tokenHash);
  },

  parseCookies,
  toSetCookie,
  hashToken,
  randomToken
};

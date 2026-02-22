import test from "node:test";
import assert from "node:assert/strict";
import { Auth } from "../src/lib/auth.js";
import { Db } from "../src/lib/db.js";

test("parseCookies parses and decodes cookie values", () => {
  const cookies = Auth.parseCookies("sid=abc123; name=Alice%20Doe; broken=%E0%A4%A");
  assert.equal(cookies.sid, "abc123");
  assert.equal(cookies.name, "Alice Doe");
  assert.equal(cookies.broken, "%E0%A4%A");
});

test("toSetCookie formats cookie attributes", () => {
  const cookie = Auth.toSetCookie({
    name: "sid",
    value: "token",
    secure: true,
    maxAge: 60,
    expires: new Date("2026-02-22T12:00:00.000Z")
  });

  assert.match(cookie, /^sid=token;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=60/);
  assert.match(cookie, /Expires=Sun, 22 Feb 2026 12:00:00 GMT/);
});

test("hashToken is deterministic SHA-256 hex", async () => {
  const first = await Auth.hashToken("abc");
  const second = await Auth.hashToken("abc");
  const third = await Auth.hashToken("different");

  assert.equal(first.length, 64);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, third);
});

test("randomToken returns 64-char hex token", () => {
  const token = Auth.randomToken();
  assert.equal(token.length, 64);
  assert.match(token, /^[a-f0-9]{64}$/);
});

test("createSessionCookie persists session and sets Set-Cookie header", async (t) => {
  let capturedInput: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  } | null = null;
  t.mock.method(Db, "createSession", async (_db: D1Database, input: unknown) => {
    capturedInput = input as {
      userId: string;
      tokenHash: string;
      expiresAt: string;
    };
  });

  const headers: Record<string, string> = {};
  const c = {
    env: { ALEXCLAW_DB: {} as D1Database },
    req: {
      header: () => undefined
    },
    header: (name: string, value: string) => {
      headers[name] = value;
    }
  } as any;

  await Auth.createSessionCookie(c, "user_1");

  assert.ok(capturedInput);
  if (!capturedInput) {
    throw new Error("capturedInput missing");
  }
  const sessionInput = capturedInput as {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  };
  assert.equal(sessionInput.userId, "user_1");
  assert.match(sessionInput.tokenHash, /^[a-f0-9]{64}$/);
  assert.ok(!Number.isNaN(Date.parse(sessionInput.expiresAt)));
  assert.match(headers["Set-Cookie"], /^sid=/);
  assert.match(headers["Set-Cookie"], /HttpOnly/);
});

test("clearSessionCookie writes an expired sid cookie", () => {
  const headers: Record<string, string> = {};
  const c = {
    header: (name: string, value: string) => {
      headers[name] = value;
    }
  } as any;

  Auth.clearSessionCookie(c);

  assert.match(headers["Set-Cookie"], /^sid=/);
  assert.match(headers["Set-Cookie"], /Max-Age=0/);
});

test("resolveUser returns null when sid cookie is missing", async (t) => {
  const getSessionUserMock = t.mock.method(Db, "getSessionUser", async () => ({
    id: "u",
    email: "a@example.com",
    name: "Alice"
  }));

  const c = {
    env: { ALEXCLAW_DB: {} as D1Database },
    req: {
      header: () => undefined
    }
  } as any;

  const user = await Auth.resolveUser(c);

  assert.equal(user, null);
  assert.equal(getSessionUserMock.mock.callCount(), 0);
});

test("resolveUser hashes sid cookie and queries DB", async (t) => {
  const getSessionUserMock = t.mock.method(Db, "getSessionUser", async () => ({
    id: "u1",
    email: "u1@example.com",
    name: "User One"
  }));

  const c = {
    env: { ALEXCLAW_DB: {} as D1Database },
    req: {
      header: (name: string) => (name === "cookie" ? "sid=test-token" : undefined)
    }
  } as any;

  const user = await Auth.resolveUser(c);

  assert.ok(user);
  assert.equal(user?.id, "u1");
  assert.equal(getSessionUserMock.mock.callCount(), 1);
  assert.match(String(getSessionUserMock.mock.calls[0]?.arguments[1]), /^[a-f0-9]{64}$/);
});

test("deleteSession is no-op without sid cookie", async (t) => {
  const deleteSessionMock = t.mock.method(Db, "deleteSession", async () => undefined);

  const c = {
    env: { ALEXCLAW_DB: {} as D1Database },
    req: {
      header: () => undefined
    }
  } as any;

  await Auth.deleteSession(c);
  assert.equal(deleteSessionMock.mock.callCount(), 0);
});

test("deleteSession hashes sid cookie before deleting", async (t) => {
  const deleteSessionMock = t.mock.method(Db, "deleteSession", async () => undefined);

  const c = {
    env: { ALEXCLAW_DB: {} as D1Database },
    req: {
      header: (name: string) => (name === "cookie" ? "sid=bye-token" : undefined)
    }
  } as any;

  await Auth.deleteSession(c);

  assert.equal(deleteSessionMock.mock.callCount(), 1);
  assert.match(String(deleteSessionMock.mock.calls[0]?.arguments[1]), /^[a-f0-9]{64}$/);
});

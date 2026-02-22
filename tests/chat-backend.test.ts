import test from "node:test";
import assert from "node:assert/strict";
import { generateChatReply } from "../src/lib/chat-backend.js";
import type { ProjectContext } from "../src/lib/hub-db.js";

const projectContext: ProjectContext = {
  project: {
    id: "project_1",
    title: "Research Project",
    thesisText: "Thesis text"
  },
  memoryDocs: [
    {
      key: "thesis_summary",
      title: "Thesis summary",
      content: "Summary",
      source: "system",
      updatedAt: "2026-02-22T00:00:00.000Z"
    }
  ],
  papers: [
    {
      id: "pp_1",
      title: "First paper",
      abstract: null,
      year: 2022,
      doi: null,
      scoreTotal: 0.6,
      tier: "FOUNDATIONAL",
      bookmarked: false,
      inReadingList: true
    }
  ]
};

test("generateChatReply uses fallback when backend URL is missing", async () => {
  const reply = await generateChatReply({
    env: {} as any,
    projectTitle: "Thesis A",
    userMessage: "Should I refine my argument?",
    chatId: "chat_1",
    projectId: "project_1",
    context: projectContext,
    history: []
  });

  assert.equal(reply.metadata?.mode, "fallback");
  assert.match(reply.content, /Noted for Thesis A\./);
  assert.match(reply.content, /First paper/);
  assert.match(reply.content, /follow-up question/);
});

test("generateChatReply forwards request and parses remote payload", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let capturedAuthorization = "";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    capturedAuthorization = headers.authorization;

    return new Response(
      JSON.stringify({
        content: "Remote answer",
        memory_docs: [
          {
            key: "progress_1",
            title: "Progress",
            content: "Drafted intro",
            source: "manual"
          },
          {
            key: "",
            title: "Invalid",
            content: "Ignored"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const reply = await generateChatReply({
    env: {
      CHAT_BACKEND_URL: "https://chat.example.test/reply",
      CHAT_BACKEND_BEARER_TOKEN: "token-123"
    } as any,
    projectTitle: "Thesis A",
    userMessage: "Update",
    chatId: "chat_1",
    projectId: "project_1",
    context: projectContext,
    history: [{ role: "user", content: "Previous" }]
  });

  assert.equal(capturedAuthorization, "Bearer token-123");
  assert.equal(reply.metadata?.mode, "remote");
  assert.equal(reply.content, "Remote answer");
  assert.deepEqual(reply.memoryDocs, [
    {
      key: "progress_1",
      title: "Progress",
      content: "Drafted intro",
      source: "manual"
    }
  ]);
});

test("generateChatReply falls back when remote returns non-ok status", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async () => new Response("failure", { status: 502 })) as typeof fetch;

  const reply = await generateChatReply({
    env: {
      CHAT_BACKEND_URL: "https://chat.example.test/reply"
    } as any,
    projectTitle: "Thesis A",
    userMessage: "Hello",
    chatId: "chat_1",
    projectId: "project_1",
    context: projectContext,
    history: []
  });

  assert.equal(reply.metadata?.mode, "fallback");
});

test("generateChatReply falls back when remote payload is invalid", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ content: "" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;

  const reply = await generateChatReply({
    env: {
      CHAT_BACKEND_URL: "https://chat.example.test/reply"
    } as any,
    projectTitle: "Thesis A",
    userMessage: "Hello",
    chatId: "chat_1",
    projectId: "project_1",
    context: projectContext,
    history: []
  });

  assert.equal(reply.metadata?.mode, "fallback");
});

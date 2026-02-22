import type { Env } from "./types.js";
import type { ProjectContext } from "./hub-db.js";

export interface ChatBackendReply {
  content: string;
  memoryDocs?: Array<{
    key: string;
    title: string;
    content: string;
    source?: "auto" | "manual" | "system";
  }>;
  metadata?: Record<string, unknown>;
}

const buildFallbackReply = (input: {
  projectTitle: string;
  userMessage: string;
  context: ProjectContext;
}): ChatBackendReply => {
  const trimmed = input.userMessage.trim();
  const paperHint = input.context.papers.slice(0, 3).map((paper) => paper.title).filter(Boolean);
  const paperLine = paperHint.length > 0
    ? `I can connect this with sources like "${paperHint.join(`", "`)}".`
    : "I can connect this with new sources as your project evolves.";

  return {
    content: [
      `Noted for ${input.projectTitle}.`,
      "I saved your update to project memory.",
      paperLine,
      trimmed.endsWith("?")
        ? "If you want, continue with a follow-up question and I will keep building your argument."
        : "Share your next thought and I will keep building the thread with you."
    ].join(" "),
    metadata: {
      mode: "fallback"
    }
  };
};

const parseReplyPayload = (payload: unknown): ChatBackendReply | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const content = typeof record.content === "string"
    ? record.content
    : typeof record.reply === "string"
      ? record.reply
      : null;
  if (!content || !content.trim()) {
    return null;
  }

  const memoryDocsRaw = Array.isArray(record.memoryDocs)
    ? record.memoryDocs
    : Array.isArray(record.memory_docs)
      ? record.memory_docs
      : [];
  const memoryDocs = memoryDocsRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const doc = entry as Record<string, unknown>;
      const key = typeof doc.key === "string" ? doc.key.trim() : "";
      const title = typeof doc.title === "string" ? doc.title.trim() : "";
      const body = typeof doc.content === "string" ? doc.content.trim() : "";
      if (!key || !title || !body) {
        return null;
      }
      const source: "auto" | "manual" | "system" =
        doc.source === "manual" || doc.source === "system" ? doc.source : "auto";
      return {
        key,
        title,
        content: body,
        source
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return {
    content: content.trim(),
    memoryDocs,
    metadata: {
      mode: "remote"
    }
  };
};

export async function generateChatReply(input: {
  env: Env;
  projectTitle: string;
  userMessage: string;
  chatId: string;
  projectId: string;
  context: ProjectContext;
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}): Promise<ChatBackendReply> {
  const backendUrl = input.env.CHAT_BACKEND_URL?.trim();
  if (!backendUrl) {
    return buildFallbackReply({
      projectTitle: input.projectTitle,
      userMessage: input.userMessage,
      context: input.context
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(input.env.CHAT_BACKEND_BEARER_TOKEN
          ? {
              authorization: `Bearer ${input.env.CHAT_BACKEND_BEARER_TOKEN}`
            }
          : {})
      },
      body: JSON.stringify({
        projectId: input.projectId,
        chatId: input.chatId,
        projectTitle: input.projectTitle,
        userMessage: input.userMessage,
        history: input.history,
        context: {
          project: input.context.project,
          memoryDocs: input.context.memoryDocs,
          papers: input.context.papers
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`chat backend error (${response.status}): ${body.slice(0, 240)}`);
    }

    const payload = await response.json().catch(() => null);
    const parsed = parseReplyPayload(payload);
    if (!parsed) {
      throw new Error("chat backend returned invalid payload");
    }
    return parsed;
  } catch {
    return buildFallbackReply({
      projectTitle: input.projectTitle,
      userMessage: input.userMessage,
      context: input.context
    });
  } finally {
    clearTimeout(timeout);
  }
}

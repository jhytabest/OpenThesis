import { Db } from "../lib/db.js";
import { processRun, processUnpaywallEnrichmentMessage } from "../lib/pipeline.js";
import type { Env, UnpaywallEnrichmentMessage } from "../lib/types.js";
import { ENRICH_QUEUE_MAX_ATTEMPTS, ENRICH_QUEUE_NAME, RUN_QUEUE_NAME } from "../app/constants.js";

const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (typeof value !== "string") {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

type QueueBatch = {
  queue: string;
  messages: Array<{ body: unknown; attempts: number; ack(): void; retry(): void }>;
};

export async function handleQueue(batch: QueueBatch, env: Env): Promise<void> {
  if (batch.queue === ENRICH_QUEUE_NAME) {
    for (const message of batch.messages) {
      let payload: UnpaywallEnrichmentMessage | null = null;
      try {
        if (typeof message.body === "string") {
          payload = safeJsonParse<UnpaywallEnrichmentMessage | null>(message.body, null);
        } else if (message.body && typeof message.body === "object") {
          payload = message.body as UnpaywallEnrichmentMessage;
        }

        if (
          !payload ||
          typeof payload.runId !== "string" ||
          typeof payload.paperId !== "string" ||
          typeof payload.openalexId !== "string" ||
          typeof payload.doi !== "string" ||
          payload.runId.length === 0 ||
          payload.paperId.length === 0 ||
          payload.openalexId.length === 0 ||
          payload.doi.length === 0
        ) {
          message.ack();
          continue;
        }

        await processUnpaywallEnrichmentMessage(env, payload);
        message.ack();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("enrichment queue message failed", {
          attempts: message.attempts,
          error: errorMessage
        });
        if (payload && message.attempts >= ENRICH_QUEUE_MAX_ATTEMPTS) {
          try {
            await Db.insertEvidence(env.ALEXCLAW_DB, {
              runId: payload.runId,
              entityType: "paper",
              entityId: payload.openalexId,
              source: "unpaywall.lookup_failed",
              detail: {
                doi: payload.doi,
                attempts: message.attempts,
                maxAttempts: ENRICH_QUEUE_MAX_ATTEMPTS,
                error: errorMessage
              }
            });
          } catch (persistenceError) {
            console.error("failed to persist enrichment terminal failure", persistenceError);
          }
          message.ack();
        } else {
          message.retry();
        }
      }
    }
    return;
  }

  if (batch.queue !== RUN_QUEUE_NAME) {
    batch.messages.forEach((message) => message.ack());
    return;
  }

  for (const message of batch.messages) {
    try {
      let payload: { runId?: string } | null = null;
      if (typeof message.body === "string") {
        payload = safeJsonParse<{ runId?: string } | null>(message.body, null);
      } else if (message.body && typeof message.body === "object") {
        payload = message.body as { runId?: string };
      }
      const runId = payload?.runId;
      if (!runId || typeof runId !== "string") {
        message.ack();
        continue;
      }

      if (env.ALEXCLAW_RUN_WORKFLOW?.create) {
        await env.ALEXCLAW_RUN_WORKFLOW.create({
          id: `run-${runId}`,
          params: { runId }
        });
      } else {
        await processRun(env, runId);
      }

      message.ack();
    } catch (error) {
      console.error("queue message failed", error);
      message.retry();
    }
  }
}

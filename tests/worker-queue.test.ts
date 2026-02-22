import test from "node:test";
import assert from "node:assert/strict";
import { handleQueue } from "../src/worker/queue.js";
import { ENRICH_QUEUE_NAME, RUN_QUEUE_NAME } from "../src/app/constants.js";

type TestMessage = {
  body: unknown;
  attempts: number;
  acked: number;
  retried: number;
  ack(): void;
  retry(): void;
};

const createMessage = (body: unknown, attempts = 1): TestMessage => ({
  body,
  attempts,
  acked: 0,
  retried: 0,
  ack() {
    this.acked += 1;
  },
  retry() {
    this.retried += 1;
  }
});

test("handleQueue acks all messages for unknown queue", async () => {
  const first = createMessage({});
  const second = createMessage({ runId: "r1" });

  await handleQueue(
    {
      queue: "unknown-queue",
      messages: [first, second]
    },
    {} as any
  );

  assert.equal(first.acked, 1);
  assert.equal(second.acked, 1);
  assert.equal(first.retried, 0);
  assert.equal(second.retried, 0);
});

test("run queue acks invalid payloads", async () => {
  const invalidString = createMessage("not-json");
  const missingRunId = createMessage({ nope: true });

  await handleQueue(
    {
      queue: RUN_QUEUE_NAME,
      messages: [invalidString, missingRunId]
    },
    {
      ALEXCLAW_RUN_WORKFLOW: {
        create: async () => ({ id: "ignored" })
      }
    } as any
  );

  assert.equal(invalidString.acked, 1);
  assert.equal(missingRunId.acked, 1);
  assert.equal(invalidString.retried, 0);
  assert.equal(missingRunId.retried, 0);
});

test("run queue dispatches workflow when runId exists", async () => {
  const valid = createMessage({ runId: "run_123" });
  const calls: Array<{ id?: string; params: { runId: string } }> = [];

  await handleQueue(
    {
      queue: RUN_QUEUE_NAME,
      messages: [valid]
    },
    {
      ALEXCLAW_RUN_WORKFLOW: {
        create: async (input: { id?: string; params: { runId: string } }) => {
          calls.push(input);
          return { id: "wf_1" };
        }
      }
    } as any
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    id: "run-run_123",
    params: { runId: "run_123" }
  });
  assert.equal(valid.acked, 1);
  assert.equal(valid.retried, 0);
});

test("enrichment queue acks invalid payloads", async () => {
  const invalid = createMessage({ runId: "", paperId: "", openalexId: "", doi: "" });

  await handleQueue(
    {
      queue: ENRICH_QUEUE_NAME,
      messages: [invalid]
    },
    {} as any
  );

  assert.equal(invalid.acked, 1);
  assert.equal(invalid.retried, 0);
});

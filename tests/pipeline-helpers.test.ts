import test from "node:test";
import assert from "node:assert/strict";
import { Db } from "../src/lib/db.js";
import {
  chunkArray,
  dedupeBy,
  normalizeQueryTerms,
  runStep,
  withRetries
} from "../src/lib/pipeline/helpers.js";

test("dedupeBy keeps first item per key", () => {
  const items = [
    { id: "a", value: 1 },
    { id: "a", value: 2 },
    { id: "b", value: 3 },
    { id: "", value: 4 }
  ];
  const deduped = dedupeBy(items, (item) => item.id);
  assert.deepEqual(deduped, [
    { id: "a", value: 1 },
    { id: "b", value: 3 }
  ]);
});

test("normalizeQueryTerms trims terms and removes empty entries", () => {
  assert.deepEqual(normalizeQueryTerms(["  graph  ", "", "  ranking", " "]), [
    "graph",
    "ranking"
  ]);
});

test("chunkArray splits arrays by size", () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("withRetries returns on first successful attempt", async () => {
  let attempts = 0;
  const result = await withRetries(
    async () => {
      attempts += 1;
      return "ok";
    },
    3,
    () => {
      throw new Error("should not retry");
    }
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 1);
});

test("withRetries throws original error when maxAttempts is reached", async () => {
  let retries = 0;
  await assert.rejects(
    () =>
      withRetries(
        async () => {
          throw new Error("boom");
        },
        1,
        () => {
          retries += 1;
        }
      ),
    /boom/
  );
  assert.equal(retries, 0);
});

test("runStep records successful run step completion", async (t) => {
  const createStepMock = t.mock.method(Db, "createRunStep", async () => "step_1");
  const completeStepMock = t.mock.method(Db, "completeRunStep", async () => undefined);
  const failStepMock = t.mock.method(Db, "failRunStep", async () => undefined);

  const result = await runStep({ ALEXCLAW_DB: {} as D1Database } as any, "run_1", "test_step", async () => ({
    done: true
  }));

  assert.deepEqual(result, { done: true });
  assert.equal(createStepMock.mock.callCount(), 1);
  assert.equal(completeStepMock.mock.callCount(), 1);
  assert.equal(failStepMock.mock.callCount(), 0);
});

test("runStep retries three times and fails", async (t) => {
  let call = 0;
  const createStepMock = t.mock.method(Db, "createRunStep", async () => {
    call += 1;
    return `step_${call}`;
  });
  const completeStepMock = t.mock.method(Db, "completeRunStep", async () => undefined);
  const failStepMock = t.mock.method(Db, "failRunStep", async () => undefined);

  await assert.rejects(
    () =>
      runStep({ ALEXCLAW_DB: {} as D1Database } as any, "run_1", "test_step", async () => {
        throw new Error("step failed");
      }),
    /step failed/
  );

  assert.equal(createStepMock.mock.callCount(), 3);
  assert.equal(completeStepMock.mock.callCount(), 0);
  assert.equal(failStepMock.mock.callCount(), 3);
});

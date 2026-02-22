import { Db } from "../db.js";
import type { Env } from "../types.js";

export const SEMANTIC_SCHOLAR_RATE_LIMIT_KEY = "semantic_scholar_api";
export const SEMANTIC_SCHOLAR_MIN_INTERVAL_MS = 1000;
export const MIN_REQUIRED_SEEDS = 1;
export const MIN_QUERY_TERMS = 3;
export const SELECTION_WINDOW = 30;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetries<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  onRetry: (attempt: number, error: unknown) => void
): Promise<T> {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error;
      }
      onRetry(attempt, error);
      const message = error instanceof Error ? error.message : String(error);
      const delayMs = message.includes("429") ? 5_000 * attempt : 500 * attempt;
      await sleep(delayMs);
    }
  }
  throw new Error("unreachable");
}

export const dedupeBy = <T>(items: T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push(item);
  }
  return output;
};

export const normalizeQueryTerms = (terms: string[]): string[] =>
  terms
    .map((term) => term.trim())
    .filter(Boolean);

export const chunkArray = <T>(items: T[], size: number): T[][] => {
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
};

export const acquireGlobalRateLimitSlot = async (
  env: Env,
  key: string,
  minIntervalMs: number
): Promise<void> => {
  await Db.ensureGlobalRateLimitKey(env.ALEXCLAW_DB, key);

  while (true) {
    const now = Date.now();
    const nextAllowedAt = await Db.readGlobalRateLimitNextAllowedMs(env.ALEXCLAW_DB, key);
    if (nextAllowedAt > now) {
      await sleep(nextAllowedAt - now);
      continue;
    }

    const claimed = await Db.compareAndSetGlobalRateLimit(
      env.ALEXCLAW_DB,
      key,
      nextAllowedAt,
      now + minIntervalMs
    );
    if (claimed) {
      return;
    }
  }
};

export async function runStep<T>(
  env: Env,
  runId: string,
  stepName: string,
  callback: () => Promise<T>
): Promise<T> {
  let attempt = 0;
  while (attempt < 3) {
    attempt += 1;
    const runStepId = await Db.createRunStep(env.ALEXCLAW_DB, runId, stepName, attempt);
    try {
      const result = await callback();
      await Db.completeRunStep(env.ALEXCLAW_DB, runStepId, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await Db.failRunStep(env.ALEXCLAW_DB, runStepId, message);
      if (attempt >= 3) {
        throw error;
      }
    }
  }
  throw new Error("unreachable");
}

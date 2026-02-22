const nowIso = (): string => new Date().toISOString();

const first = async <T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T | null> => {
  const row = await db.prepare(sql).bind(...binds).first<T>();
  return row ?? null;
};

const all = async <T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T[]> => {
  const result = await db.prepare(sql).bind(...binds).all<T>();
  return result.results;
};

const run = async (db: D1Database, sql: string, ...binds: unknown[]): Promise<void> => {
  await db.prepare(sql).bind(...binds).run();
};

const runChanges = async (db: D1Database, sql: string, ...binds: unknown[]): Promise<number> => {
  const result = await db.prepare(sql).bind(...binds).run();
  return Number((result as { meta?: { changes?: number } }).meta?.changes ?? 0);
};

const toNonNegativeInt = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.trunc(parsed);
};

const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeBool = (value: boolean | undefined, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

export { all, first, normalizeBool, nowIso, run, runChanges, safeJsonParse, toNonNegativeInt };

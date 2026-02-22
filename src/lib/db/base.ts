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

export { all, first, nowIso, run, runChanges, toNonNegativeInt };

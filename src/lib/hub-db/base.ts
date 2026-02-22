export const nowIso = (): string => new Date().toISOString();

export const first = async <T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T | null> => {
  const row = await db.prepare(sql).bind(...binds).first<T>();
  return row ?? null;
};

export const all = async <T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T[]> => {
  const result = await db.prepare(sql).bind(...binds).all<T>();
  return result.results;
};

export const run = async (db: D1Database, sql: string, ...binds: unknown[]): Promise<void> => {
  await db.prepare(sql).bind(...binds).run();
};

export const runChanges = async (db: D1Database, sql: string, ...binds: unknown[]): Promise<number> => {
  const result = await db.prepare(sql).bind(...binds).run();
  return Number((result as { meta?: { changes?: number } }).meta?.changes ?? 0);
};

export const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const normalizeBool = (value: boolean | undefined, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

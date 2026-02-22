import { first, nowIso, run, runChanges } from "./base.js";

export const rateLimitRepo = {
  async ensureGlobalRateLimitKey(db: D1Database, key: string): Promise<void> {
    await run(
      db,
      `INSERT INTO global_rate_limits (rate_key, next_allowed_at_ms, updated_at)
       VALUES (?, 0, ?)
       ON CONFLICT(rate_key) DO NOTHING`,
      key,
      nowIso()
    );
  },

  async readGlobalRateLimitNextAllowedMs(db: D1Database, key: string): Promise<number> {
    const row = await first<{ next_allowed_at_ms: number }>(
      db,
      `SELECT next_allowed_at_ms FROM global_rate_limits WHERE rate_key = ?`,
      key
    );
    return Number(row?.next_allowed_at_ms ?? 0);
  },

  async compareAndSetGlobalRateLimit(
    db: D1Database,
    key: string,
    expectedNextAllowedMs: number,
    newNextAllowedMs: number
  ): Promise<boolean> {
    const changes = await runChanges(
      db,
      `UPDATE global_rate_limits
       SET next_allowed_at_ms = ?, updated_at = ?
       WHERE rate_key = ? AND next_allowed_at_ms = ?`,
      newNextAllowedMs,
      nowIso(),
      key,
      expectedNextAllowedMs
    );
    return changes > 0;
  },

  async tryAcquireGlobalRateLimitWindow(
    db: D1Database,
    key: string,
    minIntervalMs: number
  ): Promise<{ allowed: boolean; retryAfterMs: number }> {
    await this.ensureGlobalRateLimitKey(db, key);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const now = Date.now();
      const expectedNextAllowedMs = await this.readGlobalRateLimitNextAllowedMs(db, key);
      if (expectedNextAllowedMs > now) {
        return { allowed: false, retryAfterMs: expectedNextAllowedMs - now };
      }
      const updated = await this.compareAndSetGlobalRateLimit(
        db,
        key,
        expectedNextAllowedMs,
        now + minIntervalMs
      );
      if (updated) {
        return { allowed: true, retryAfterMs: 0 };
      }
    }
    return { allowed: false, retryAfterMs: minIntervalMs };
  }
};

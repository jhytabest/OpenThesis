import { Db } from "../lib/db.js";
import { assertInternalRequest, json, type App } from "./shared.js";

export function registerInternalRoutes(app: App): void {
  app.get("/internal/health", (c) => {
    const denied = assertInternalRequest(c);
    if (denied) {
      return denied;
    }
    return json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get("/internal/metrics", async (c) => {
    const denied = assertInternalRequest(c);
    if (denied) {
      return denied;
    }
    const runsByStatus = await Db.metricsRunsByStatus(c.env.ALEXCLAW_DB);
    return json({ runsByStatus });
  });
}

import { Hono } from "hono";
import type { Env } from "./lib/types.js";
import type { AppBindings } from "./routes/types.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProjectCoreRoutes } from "./routes/projects-core.js";
import { registerProjectChatRoutes } from "./routes/projects-chats.js";
import { registerProjectPaperRoutes } from "./routes/projects-papers.js";
import { registerProjectWorkspaceRoutes } from "./routes/projects-workspace.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { handleQueue } from "./worker/queue.js";

// Worker composition only: routes and processing live in dedicated modules.
const app = new Hono<AppBindings>();

registerInternalRoutes(app);
registerAuthRoutes(app);
registerSettingsRoutes(app);
registerProjectCoreRoutes(app);
registerProjectWorkspaceRoutes(app);
registerProjectChatRoutes(app);
registerProjectPaperRoutes(app);

const isAssetRequestPath = (pathname: string): boolean =>
  !(
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/internal/")
  );

app.get("*", async (c) => {
  const pathname = new URL(c.req.url).pathname;
  if (!isAssetRequestPath(pathname)) {
    return c.notFound();
  }
  if (!c.env.ASSETS) {
    return c.text("Static assets binding is not configured", 503);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export { AlexclawRunWorkflow } from "./worker/workflow.js";

export default {
  fetch: app.fetch,
  async queue(
    batch: {
      queue: string;
      messages: Array<{ body: unknown; attempts: number; ack(): void; retry(): void }>;
    },
    env: Env
  ): Promise<void> {
    await handleQueue(batch, env);
  }
};

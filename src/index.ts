import { Hono } from "hono";
import type { Env } from "./lib/types.js";
import { renderHomeHtml } from "./ui/index.js";
import type { AppBindings } from "./routes/types.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProjectCoreRoutes } from "./routes/projects-core.js";
import { registerProjectChatRoutes } from "./routes/projects-chats.js";
import { registerProjectPaperRoutes } from "./routes/projects-papers.js";
import { registerLegacyRoutes } from "./routes/legacy.js";
import { handleQueue } from "./worker/queue.js";

// Worker composition only: routes and processing live in dedicated modules.
const app = new Hono<AppBindings>();

app.get("/", (c) => c.html(renderHomeHtml()));

registerInternalRoutes(app);
registerAuthRoutes(app);
registerProjectCoreRoutes(app);
registerProjectChatRoutes(app);
registerProjectPaperRoutes(app);
registerLegacyRoutes(app);

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

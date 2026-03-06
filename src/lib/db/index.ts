import { accountRepo } from "./account.js";
import { papersRepo } from "./papers.js";
import { rateLimitRepo } from "./rate-limits.js";
import { runsRepo } from "./runs.js";
import { workspaceRepo } from "./workspace.js";

export type { RunEnrichmentProgress, RunRow } from "./types.js";

export const Db = {
  ...accountRepo,
  ...runsRepo,
  ...papersRepo,
  ...rateLimitRepo,
  ...workspaceRepo
};

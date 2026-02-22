import { chatsRepo } from "./chats.js";
import { dashboardRepo } from "./dashboard.js";
import { memoryRepo } from "./memory.js";
import { papersRepo } from "./papers.js";
import { projectsRepo } from "./projects.js";

export type { ProjectContext, ProjectListRow, ProjectPaperRow } from "./types.js";

export const HubDb = {
  ...projectsRepo,
  ...chatsRepo,
  ...memoryRepo,
  ...papersRepo,
  ...dashboardRepo
};

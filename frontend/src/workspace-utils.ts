import type { ExplorerFilters, ProjectDashboard, ProjectSummary } from "./types";

export const decodeListInput = (raw: string): string[] => {
  const seen = new Set<string>();
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
};

export const formatDate = (value: string | null | undefined): string => {
  if (!value) {
    return "";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export const projectTitle = (project: ProjectSummary): string => {
  const title = typeof project.title === "string" ? project.title.trim() : "";
  return title || `Project ${project.id.slice(0, 8)}`;
};

export const projectStatusLabel = (project: ProjectSummary): string => {
  const status = project.latestRun?.status;
  if (status === "RUNNING" || status === "QUEUED") {
    return "Updating suggestions";
  }
  if (status === "FAILED") {
    return "Needs another pass";
  }
  if (status === "COMPLETED") {
    return "Suggestions ready";
  }
  return "Ready";
};

export const isProjectUpdating = (project: ProjectSummary): boolean =>
  project.latestRun?.status === "RUNNING" || project.latestRun?.status === "QUEUED";

export const mapSortLabel = (sort: ExplorerFilters["sort"]): string => {
  if (sort === "recent") {
    return "Recent";
  }
  if (sort === "citations") {
    return "Citations";
  }
  if (sort === "newest") {
    return "Recently added";
  }
  return "Most relevant";
};

export const dashboardStatusLine = (dashboard: ProjectDashboard | null): string => {
  if (!dashboard?.latestRun) {
    return "Suggestions will appear after the first background pass.";
  }
  if (dashboard.latestRun.status === "FAILED") {
    return "Background suggestions need another pass.";
  }
  if (dashboard.latestRun.status === "RUNNING" || dashboard.latestRun.status === "QUEUED") {
    return "Background suggestions are updating.";
  }
  return "Background suggestions are ready.";
};

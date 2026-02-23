import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardStatusLine,
  decodeListInput,
  isProjectUpdating,
  mapSortLabel,
  projectStatusLabel,
  projectTitle
} from "../frontend/src/workspace-utils";
import type { ProjectDashboard, ProjectSummary } from "../frontend/src/types";

test("decodeListInput trims, deduplicates and drops empty values", () => {
  const result = decodeListInput(" AI, ml,AI,  ,ML ,stats ");
  assert.deepEqual(result, ["AI", "ml", "stats"]);
});

test("project helpers return stable labels", () => {
  const project: ProjectSummary = {
    id: "12345678-90ab-cdef-1234-567890abcdef",
    title: "",
    createdAt: "2026-02-23T00:00:00.000Z",
    textPreview: "",
    latestRun: {
      id: "run-1",
      status: "RUNNING",
      updatedAt: "2026-02-23T00:00:00.000Z"
    },
    counts: {
      papers: 1,
      readingList: 0,
      bookmarked: 0,
      chats: 0
    }
  };

  assert.equal(projectTitle(project), "Project 12345678");
  assert.equal(projectStatusLabel(project), "Updating suggestions");
  assert.equal(isProjectUpdating(project), true);
  assert.equal(mapSortLabel("newest"), "Recently added");
});

test("dashboardStatusLine reflects run state", () => {
  const dashboard: ProjectDashboard = {
    project: {
      id: "project-1",
      title: "Test",
      thesisText: "Example",
      createdAt: "2026-02-23T00:00:00.000Z"
    },
    summary: {
      thesisSummary: "x",
      progressLog: "y"
    },
    stats: {
      papers: 1,
      foundational: 1,
      depth: 0,
      background: 0,
      openAccess: 0,
      readingList: 0,
      bookmarked: 0,
      chats: 0,
      memoryDocs: 0
    },
    latestRun: {
      id: "run-1",
      status: "FAILED",
      error: "boom",
      updatedAt: "2026-02-23T00:00:00.000Z"
    }
  };

  assert.equal(dashboardStatusLine(dashboard), "Background suggestions need another pass.");
});

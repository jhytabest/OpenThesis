import type { RunStatus } from "../types.js";
import { all, first } from "./base.js";
import { memoryRepo } from "./memory.js";
import { projectsRepo } from "./projects.js";
import type { ProjectContext } from "./types.js";

export const dashboardRepo = {
  async getProjectDashboardOwned(db: D1Database, projectId: string, userId: string): Promise<{
    project: {
      id: string;
      title: string | null;
      thesisText: string;
      createdAt: string;
    };
    summary: {
      thesisSummary: string | null;
      progressLog: string | null;
    };
    stats: {
      papers: number;
      foundational: number;
      depth: number;
      background: number;
      openAccess: number;
      readingList: number;
      bookmarked: number;
      chats: number;
      memoryDocs: number;
    };
    latestRun: {
      id: string;
      status: RunStatus;
      error: string | null;
      updatedAt: string;
    } | null;
  } | null> {
    const project = await projectsRepo.getProjectOwned(db, projectId, userId);
    if (!project) {
      return null;
    }

    const [statsRow, summaryDoc, progressDoc, latestRun] = await Promise.all([
      first<{
        papers: number;
        foundational: number;
        depth: number;
        background: number;
        open_access: number;
        reading_list: number;
        bookmarked: number;
        chats: number;
      }>(
        db,
        `SELECT
           paper_count AS papers,
           foundational_count AS foundational,
           depth_count AS depth,
           background_count AS background,
           open_access_count AS open_access,
           reading_count AS reading_list,
           bookmarked_count AS bookmarked,
           chat_count AS chats
         FROM project_stats
         WHERE project_id = ?`,
        projectId
      ),
      first<{ content: string }>(
        db,
        `SELECT content
         FROM project_memory_docs
         WHERE project_id = ? AND doc_key = 'thesis_summary'`,
        projectId
      ),
      first<{ content: string }>(
        db,
        `SELECT content
         FROM project_memory_docs
         WHERE project_id = ? AND doc_key = 'progress_log'`,
        projectId
      ),
      projectsRepo.getProjectLatestRunOwned(db, projectId, userId)
    ]);

    const memoryCountRow = await first<{ memory_count: number }>(
      db,
      `SELECT COUNT(*) AS memory_count
       FROM project_memory_docs
       WHERE project_id = ?`,
      projectId
    );

    return {
      project: {
        id: project.id,
        title: project.title,
        thesisText: project.text,
        createdAt: project.created_at
      },
      summary: {
        thesisSummary: summaryDoc?.content ?? null,
        progressLog: progressDoc?.content ?? null
      },
      stats: {
        papers: Number(statsRow?.papers ?? 0),
        foundational: Number(statsRow?.foundational ?? 0),
        depth: Number(statsRow?.depth ?? 0),
        background: Number(statsRow?.background ?? 0),
        openAccess: Number(statsRow?.open_access ?? 0),
        readingList: Number(statsRow?.reading_list ?? 0),
        bookmarked: Number(statsRow?.bookmarked ?? 0),
        chats: Number(statsRow?.chats ?? 0),
        memoryDocs: Number(memoryCountRow?.memory_count ?? 0)
      },
      latestRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            error: latestRun.error,
            updatedAt: latestRun.updated_at
          }
        : null
    };
  },

  async getProjectContextOwned(db: D1Database, input: {
    projectId: string;
    userId: string;
    paperLimit?: number;
  }): Promise<ProjectContext | null> {
    const project = await projectsRepo.getProjectOwned(db, input.projectId, input.userId);
    if (!project) {
      return null;
    }

    const [memoryDocs, papers] = await Promise.all([
      memoryRepo.listProjectMemoryDocsOwned(db, input.projectId, input.userId),
      all<{
        id: string;
        title: string;
        abstract: string | null;
        year: number | null;
        doi: string | null;
        score_total: number | null;
        tier: "FOUNDATIONAL" | "DEPTH" | "BACKGROUND" | null;
        bookmarked: number;
        in_reading_list: number;
      }>(
        db,
        `SELECT
           pp.id,
           pp.title,
           pp.abstract,
           pp.year,
           pp.doi,
           pp.score_total,
           pp.tier,
           pp.bookmarked,
           pp.in_reading_list
         FROM project_papers pp
         INNER JOIN theses t ON t.id = pp.project_id
         WHERE pp.project_id = ? AND t.user_id = ? AND pp.is_deleted = 0
         ORDER BY
           pp.score_total DESC,
           pp.citation_count DESC,
           pp.updated_at DESC
         LIMIT ?`,
        input.projectId,
        input.userId,
        Math.max(1, Math.min(100, input.paperLimit ?? 30))
      )
    ]);

    return {
      project: {
        id: project.id,
        title: project.title,
        thesisText: project.text
      },
      memoryDocs: memoryDocs.map((doc) => ({
        key: doc.key,
        title: doc.title,
        content: doc.content,
        source: doc.source,
        updatedAt: doc.updated_at
      })),
      papers: papers.map((paper) => ({
        id: paper.id,
        title: paper.title,
        abstract: paper.abstract,
        year: paper.year,
        doi: paper.doi,
        scoreTotal: paper.score_total,
        tier: paper.tier,
        bookmarked: paper.bookmarked === 1,
        inReadingList: paper.in_reading_list === 1
      }))
    };
  }
};

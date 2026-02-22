import type { RunStatus } from "../types.js";
import { first } from "./base.js";
import { memoryRepo } from "./memory.js";
import { papersRepo } from "./papers.js";
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
      }>(
        db,
        `SELECT
           SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) AS papers,
           SUM(CASE WHEN is_deleted = 0 AND tier = 'FOUNDATIONAL' THEN 1 ELSE 0 END) AS foundational,
           SUM(CASE WHEN is_deleted = 0 AND tier = 'DEPTH' THEN 1 ELSE 0 END) AS depth,
           SUM(CASE WHEN is_deleted = 0 AND tier = 'BACKGROUND' THEN 1 ELSE 0 END) AS background,
           SUM(
             CASE
               WHEN is_deleted = 0
                 AND (pdf_url IS NOT NULL OR (oa_status IS NOT NULL AND trim(oa_status) <> ''))
               THEN 1
               ELSE 0
             END
           ) AS open_access,
           SUM(CASE WHEN is_deleted = 0 AND in_reading_list = 1 THEN 1 ELSE 0 END) AS reading_list,
           SUM(CASE WHEN is_deleted = 0 AND bookmarked = 1 THEN 1 ELSE 0 END) AS bookmarked
         FROM project_papers
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

    const chatCountRow = await first<{ chat_count: number }>(
      db,
      `SELECT COUNT(*) AS chat_count
       FROM project_chats
       WHERE project_id = ? AND user_id = ?`,
      projectId,
      userId
    );

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
        chats: Number(chatCountRow?.chat_count ?? 0),
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
      papersRepo.listProjectPapersOwned(db, {
        projectId: input.projectId,
        userId: input.userId,
        sort: "relevance",
        includeDeleted: false,
        limit: input.paperLimit ?? 30
      })
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

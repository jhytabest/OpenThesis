import { Auth } from "../lib/auth.js";
import { Db } from "../lib/db.js";
import {
  MAX_THESIS_TEXT_LENGTH,
  RUN_CREATE_MIN_INTERVAL_MS,
  THESIS_CREATE_MIN_INTERVAL_MS
} from "../app/constants.js";
import { json, safeJsonParse, type App } from "./shared.js";

export function registerLegacyRoutes(app: App): void {
  app.get("/api/theses", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const theses = await Db.listThesesByUser(c.env.ALEXCLAW_DB, user.id);
    return json({
      theses: theses.map((thesis) => ({
        id: thesis.id,
        title: thesis.title,
        createdAt: thesis.created_at,
        textPreview: thesis.text.slice(0, 180)
      }))
    });
  });

  app.get("/api/theses/:thesisId", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const thesisId = c.req.param("thesisId");
    const thesis = await Db.getThesisOwned(c.env.ALEXCLAW_DB, thesisId, user.id);
    if (!thesis) {
      return json({ error: "Thesis not found" }, 404);
    }

    return json({
      thesis: {
        id: thesis.id,
        title: thesis.title,
        text: thesis.text,
        createdAt: thesis.created_at
      }
    });
  });

  app.post("/api/theses", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const createThrottle = await Db.tryAcquireGlobalRateLimitWindow(
      c.env.ALEXCLAW_DB,
      `thesis_create:${user.id}`,
      THESIS_CREATE_MIN_INTERVAL_MS
    );
    if (!createThrottle.allowed) {
      const response = json(
        { error: "Too many thesis create requests", retryAfterMs: createThrottle.retryAfterMs },
        429
      );
      response.headers.set("Retry-After", String(Math.max(1, Math.ceil(createThrottle.retryAfterMs / 1000))));
      return response;
    }

    const bodyRaw = await c.req.json().catch(() => ({}));
    const body = bodyRaw as { text?: string };
    const text = body.text?.trim();
    if (!text || text.length < 30) {
      return json({ error: "text is required and must be at least 30 characters" }, 400);
    }
    if (text.length > MAX_THESIS_TEXT_LENGTH) {
      return json({ error: `text must be at most ${MAX_THESIS_TEXT_LENGTH} characters` }, 413);
    }

    const thesis = await Db.createThesis(c.env.ALEXCLAW_DB, {
      userId: user.id,
      text
    });

    return json(
      {
        thesis: {
          id: thesis.id,
          title: thesis.title,
          createdAt: thesis.created_at
        }
      },
      201
    );
  });

  app.post("/api/theses/:thesisId/runs", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const runThrottle = await Db.tryAcquireGlobalRateLimitWindow(
      c.env.ALEXCLAW_DB,
      `run_create:${user.id}`,
      RUN_CREATE_MIN_INTERVAL_MS
    );
    if (!runThrottle.allowed) {
      const response = json({ error: "Too many run requests", retryAfterMs: runThrottle.retryAfterMs }, 429);
      response.headers.set("Retry-After", String(Math.max(1, Math.ceil(runThrottle.retryAfterMs / 1000))));
      return response;
    }

    const thesisId = c.req.param("thesisId");
    try {
      const run = await Db.createRun(c.env.ALEXCLAW_DB, {
        userId: user.id,
        thesisId
      });
      await c.env.ALEXCLAW_RUN_QUEUE.send({ runId: run.id });

      return json(
        {
          run: {
            id: run.id,
            status: run.status,
            createdAt: run.created_at
          }
        },
        201
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "THESIS_NOT_FOUND") {
        return json({ error: "Thesis not found" }, 404);
      }
      return json({ error: message }, 500);
    }
  });

  app.get("/api/runs", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const runs = await Db.listRunsByUser(c.env.ALEXCLAW_DB, user.id);
    const enrichmentProgress = await Db.listRunEnrichmentProgressByUser(c.env.ALEXCLAW_DB, user.id);
    const enrichmentByRunId = new Map(enrichmentProgress.map((entry) => [entry.run_id, entry]));
    return json({
      runs: runs.map((run) => {
        const enrichment = enrichmentByRunId.get(run.id);
        return {
          id: run.id,
          thesisId: run.thesis_id,
          status: run.status,
          error: run.error,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
          enrichment: {
            enqueued: enrichment?.enqueued_count ?? 0,
            completed: enrichment?.lookup_completed_count ?? 0,
            found: enrichment?.lookup_found_count ?? 0,
            notFound: enrichment?.lookup_not_found_count ?? 0,
            failed: enrichment?.lookup_failed_count ?? 0,
            pending: enrichment?.pending_count ?? 0
          }
        };
      })
    });
  });

  app.get("/api/runs/:runId", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const runId = c.req.param("runId");
    const run = await Db.getRunOwned(c.env.ALEXCLAW_DB, runId, user.id);
    if (!run) {
      return json({ error: "Run not found" }, 404);
    }

    const steps = await Db.listRunStepsOwned(c.env.ALEXCLAW_DB, runId, user.id);
    const enrichment = await Db.getRunEnrichmentProgressOwned(c.env.ALEXCLAW_DB, runId, user.id);
    return json({
      run: {
        id: run.id,
        thesisId: run.thesis_id,
        status: run.status,
        error: run.error,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        enrichment: {
          enqueued: enrichment?.enqueued_count ?? 0,
          completed: enrichment?.lookup_completed_count ?? 0,
          found: enrichment?.lookup_found_count ?? 0,
          notFound: enrichment?.lookup_not_found_count ?? 0,
          failed: enrichment?.lookup_failed_count ?? 0,
          pending: enrichment?.pending_count ?? 0
        },
        steps: steps.map((step) => ({
          id: step.id,
          name: step.step_name,
          status: step.status,
          attempt: step.attempt,
          startedAt: step.started_at,
          finishedAt: step.finished_at,
          error: step.error,
          payload: step.payload_json ? safeJsonParse(step.payload_json, null) : null
        }))
      }
    });
  });

  app.get("/api/runs/:runId/papers", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const runId = c.req.param("runId");
    const run = await Db.getRunOwned(c.env.ALEXCLAW_DB, runId, user.id);
    if (!run) {
      return json({ error: "Run not found" }, 404);
    }

    const [papers, paperAuthors, paperCitations] = await Promise.all([
      Db.listRunPapersOwned(c.env.ALEXCLAW_DB, runId, user.id),
      Db.listRunPaperAuthorsOwned(c.env.ALEXCLAW_DB, runId, user.id),
      Db.listRunPaperCitationsOwned(c.env.ALEXCLAW_DB, runId, user.id)
    ]);

    const authorsByPaperId = new Map<
      string,
      Array<{ id: string; openalexId: string | null; name: string; orcid: string | null; position: number }>
    >();
    for (const author of paperAuthors) {
      const bucket = authorsByPaperId.get(author.paper_id) ?? [];
      bucket.push({
        id: author.author_id,
        openalexId: author.openalex_id,
        name: author.name,
        orcid: author.orcid,
        position: author.author_position
      });
      authorsByPaperId.set(author.paper_id, bucket);
    }

    const citationsByPaperId = new Map<
      string,
      Array<{ openalexId: string; title: string | null; inRun: boolean }>
    >();
    for (const citation of paperCitations) {
      const bucket = citationsByPaperId.get(citation.paper_id) ?? [];
      bucket.push({
        openalexId: citation.cited_openalex_id,
        title: citation.cited_title,
        inRun: citation.cited_in_run === 1
      });
      citationsByPaperId.set(citation.paper_id, bucket);
    }

    return json({
      papers: papers.map((paper) => ({
        id: paper.paper_id,
        openalexId: paper.openalex_id,
        semanticScholarId: paper.semantic_scholar_id,
        title: paper.title,
        abstract: paper.abstract,
        year: paper.year,
        doi: paper.doi,
        citationCount: paper.citation_count,
        fieldsOfStudy: safeJsonParse<string[]>(paper.fields_of_study_json, []),
        score: {
          lexical: paper.lexical_score,
          graph: paper.graph_score,
          citation: paper.citation_score,
          total: paper.total_score
        },
        tier: paper.tier,
        access: {
          pdfUrl: paper.pdf_url,
          oaStatus: paper.oa_status,
          license: paper.license
        },
        authors: authorsByPaperId.get(paper.paper_id) ?? [],
        citations: citationsByPaperId.get(paper.paper_id) ?? []
      }))
    });
  });

  app.get("/api/runs/:runId/authors", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const runId = c.req.param("runId");
    const run = await Db.getRunOwned(c.env.ALEXCLAW_DB, runId, user.id);
    if (!run) {
      return json({ error: "Run not found" }, 404);
    }

    const authors = await Db.listRunAuthorsOwned(c.env.ALEXCLAW_DB, runId, user.id);
    return json({
      authors: authors.map((author) => ({
        id: author.author_id,
        openalexId: author.openalex_id,
        name: author.name,
        orcid: author.orcid,
        paperCount: author.paper_count
      }))
    });
  });

  app.get("/api/runs/:runId/evidence", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const runId = c.req.param("runId");
    const run = await Db.getRunOwned(c.env.ALEXCLAW_DB, runId, user.id);
    if (!run) {
      return json({ error: "Run not found" }, 404);
    }

    const entityType = c.req.query("entityType");
    const entityId = c.req.query("entityId");
    const evidence = await Db.listEvidenceOwned(c.env.ALEXCLAW_DB, runId, user.id, entityType, entityId);

    return json({
      evidence: evidence.map((entry) => ({
        id: entry.id,
        entityType: entry.entity_type,
        entityId: entry.entity_id,
        source: entry.source,
        detail: safeJsonParse(entry.detail_json, null),
        createdAt: entry.created_at
      }))
    });
  });
}

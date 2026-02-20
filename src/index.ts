import { Hono, type Context } from "hono";
import { Auth } from "./lib/auth.js";
import { Db } from "./lib/db.js";
import { OAuth } from "./lib/oauth.js";
import { processRun, processUnpaywallEnrichmentMessage } from "./lib/pipeline.js";
import type { Env, UnpaywallEnrichmentMessage } from "./lib/types.js";
import { renderHomeHtml } from "./ui/index.js";
import { WorkflowEntrypoint } from "cloudflare:workers";

interface AppBindings {
  Bindings: Env;
}

const app = new Hono<AppBindings>();

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });

const MAX_THESIS_TEXT_LENGTH = 50_000;
const THESIS_CREATE_MIN_INTERVAL_MS = 3_000;
const RUN_CREATE_MIN_INTERVAL_MS = 15_000;
const RUN_QUEUE_NAME = "alexclaw-runs";
const ENRICH_QUEUE_NAME = "alexclaw-enrichment";
const ENRICH_QUEUE_MAX_ATTEMPTS = 4;

const safeJsonParse = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const readAuthToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader) {
    return null;
  }
  if (authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return authorizationHeader.slice("bearer ".length).trim();
  }
  return authorizationHeader.trim();
};

const isInternalRequestAuthorized = (c: Context<AppBindings>): boolean => {
  const expectedToken = c.env.INTERNAL_API_TOKEN?.trim();
  if (!expectedToken) {
    return false;
  }
  const headerToken = readAuthToken(c.req.header("authorization"));
  const directToken = c.req.header("x-internal-token")?.trim() ?? null;
  return headerToken === expectedToken || directToken === expectedToken;
};

const assertInternalRequest = (c: Context<AppBindings>): Response | null =>
  isInternalRequestAuthorized(c) ? null : new Response("Not Found", { status: 404 });

app.get("/", (c) => c.html(renderHomeHtml()));

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

app.get("/auth/google", async (c) => {
  if (!OAuth.isConfigured(c.env)) {
    return json({ error: "Google OAuth is not configured" }, 503);
  }

  const callbackUrl = OAuth.resolveGoogleCallbackUrl(c.req.url);
  const state = Auth.randomToken();
  c.header(
    "Set-Cookie",
    Auth.toSetCookie({
      name: "oauth_state",
      value: state,
      maxAge: 600,
      secure: true
    })
  );

  return c.redirect(OAuth.buildGoogleAuthorizationUrl(c.env, state, callbackUrl));
});

app.get("/auth/google/callback", async (c) => {
  try {
    if (!OAuth.isConfigured(c.env)) {
      return json({ error: "Google OAuth is not configured" }, 503);
    }

    const code = c.req.query("code");
    const state = c.req.query("state");

    if (!code || !state) {
      return json({ error: "Missing OAuth callback params" }, 400);
    }

    const cookies = Auth.parseCookies(c.req.header("cookie"));
    const expectedState = cookies.oauth_state;
    if (!expectedState || expectedState !== state) {
      return json({ error: "Invalid OAuth state" }, 400);
    }

    const callbackUrl = OAuth.resolveGoogleCallbackUrl(c.req.url);
    const token = await OAuth.exchangeGoogleCode(c.env, code, callbackUrl);
    const profile = await OAuth.fetchGoogleProfile(token.access_token);

    if (!profile.sub || !profile.email) {
      return json({ error: "Google profile missing required fields" }, 400);
    }
    if (profile.email_verified !== true) {
      return json({ error: "Google account email must be verified" }, 403);
    }

    const user = await Db.createOrUpdateGoogleUser(c.env.ALEXCLAW_DB, {
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email
    });

    await Auth.createSessionCookie(c, user.id);
    c.header(
      "Set-Cookie",
      Auth.toSetCookie({
        name: "oauth_state",
        value: "",
        maxAge: 0,
        secure: true
      }),
      { append: true }
    );
    return c.redirect("/");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "EMAIL_ALREADY_IN_USE") {
      return json({ error: "An account with this email already exists under a different identity" }, 409);
    }
    return json({ error: message }, 500);
  }
});

app.get("/api/auth/me", async (c) => {
  const user = await Auth.resolveUser(c);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }
  return json({ user });
});

app.post("/api/auth/logout", async (c) => {
  await Auth.deleteSession(c);
  Auth.clearSessionCookie(c);
  return json({ ok: true });
});

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

export class AlexclawRunWorkflow extends WorkflowEntrypoint<Env, { runId: string }> {
  override async run(event: any, step: any): Promise<{ runId: string }> {
    const runId = event.payload?.runId ?? event.params?.runId;
    if (!runId) {
      throw new Error("Missing runId in workflow payload");
    }

    if (step?.do) {
      await step.do("process-run", async () => {
        await processRun(this.env, runId);
        return { ok: true };
      });
    } else {
      await processRun(this.env, runId);
    }

    return { runId };
  }
}

export default {
  fetch: app.fetch,
  async queue(
    batch: {
      queue: string;
      messages: Array<{ body: unknown; attempts: number; ack(): void; retry(): void }>;
    },
    env: Env
  ): Promise<void> {
    if (batch.queue === ENRICH_QUEUE_NAME) {
      for (const message of batch.messages) {
        let payload: UnpaywallEnrichmentMessage | null = null;
        try {
          if (typeof message.body === "string") {
            payload = safeJsonParse<UnpaywallEnrichmentMessage | null>(message.body, null);
          } else if (message.body && typeof message.body === "object") {
            payload = message.body as UnpaywallEnrichmentMessage;
          }

          if (
            !payload ||
            typeof payload.runId !== "string" ||
            typeof payload.paperId !== "string" ||
            typeof payload.openalexId !== "string" ||
            typeof payload.doi !== "string" ||
            payload.runId.length === 0 ||
            payload.paperId.length === 0 ||
            payload.openalexId.length === 0 ||
            payload.doi.length === 0
          ) {
            message.ack();
            continue;
          }

          await processUnpaywallEnrichmentMessage(env, payload);
          message.ack();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error("enrichment queue message failed", {
            attempts: message.attempts,
            error: errorMessage
          });
          if (payload && message.attempts >= ENRICH_QUEUE_MAX_ATTEMPTS) {
            try {
              await Db.insertEvidence(env.ALEXCLAW_DB, {
                runId: payload.runId,
                entityType: "paper",
                entityId: payload.openalexId,
                source: "unpaywall.lookup_failed",
                detail: {
                  doi: payload.doi,
                  attempts: message.attempts,
                  maxAttempts: ENRICH_QUEUE_MAX_ATTEMPTS,
                  error: errorMessage
                }
              });
            } catch (persistenceError) {
              console.error("failed to persist enrichment terminal failure", persistenceError);
            }
            message.ack();
          } else {
            message.retry();
          }
        }
      }
      return;
    }

    if (batch.queue !== RUN_QUEUE_NAME) {
      batch.messages.forEach((message) => message.ack());
      return;
    }

    for (const message of batch.messages) {
      try {
        let payload: { runId?: string } | null = null;
        if (typeof message.body === "string") {
          payload = safeJsonParse<{ runId?: string } | null>(message.body, null);
        } else if (message.body && typeof message.body === "object") {
          payload = message.body as { runId?: string };
        }
        const runId = payload?.runId;
        if (!runId || typeof runId !== "string") {
          message.ack();
          continue;
        }

        if (env.ALEXCLAW_RUN_WORKFLOW?.create) {
          await env.ALEXCLAW_RUN_WORKFLOW.create({
            id: `run-${runId}`,
            params: { runId }
          });
        } else {
          await processRun(env, runId);
        }

        message.ack();
      } catch (error) {
        console.error("queue message failed", error);
        message.retry();
      }
    }
  }
};

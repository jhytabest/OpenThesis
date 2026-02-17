import { Hono } from "hono";
import { Auth } from "./lib/auth.js";
import { Db } from "./lib/db.js";
import { OAuth } from "./lib/oauth.js";
import { processRun } from "./lib/pipeline.js";
import type { Env } from "./lib/types.js";
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

app.get("/", (c) => c.html(renderHomeHtml()));

app.get("/internal/health", () => json({ ok: true, timestamp: new Date().toISOString() }));

app.get("/internal/metrics", async (c) => {
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
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
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

app.post("/api/theses", async (c) => {
  const user = await Auth.resolveUser(c);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const bodyRaw = await c.req.json().catch(() => ({}));
  const body = bodyRaw as { title?: string; text?: string };
  const text = body.text?.trim();
  if (!text || text.length < 30) {
    return json({ error: "text is required and must be at least 30 characters" }, 400);
  }

  const title = body.title?.trim() || "Untitled thesis";
  const thesis = await Db.createThesis(c.env.ALEXCLAW_DB, {
    userId: user.id,
    title,
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
  return json({
    runs: runs.map((run) => ({
      id: run.id,
      thesisId: run.thesis_id,
      status: run.status,
      error: run.error,
      createdAt: run.created_at,
      updatedAt: run.updated_at
    }))
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
  return json({
    run: {
      id: run.id,
      thesisId: run.thesis_id,
      status: run.status,
      error: run.error,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      steps: steps.map((step) => ({
        id: step.id,
        name: step.step_name,
        status: step.status,
        attempt: step.attempt,
        startedAt: step.started_at,
        finishedAt: step.finished_at,
        error: step.error,
        payload: step.payload_json ? JSON.parse(step.payload_json) : null
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

  const papers = await Db.listRunPapersOwned(c.env.ALEXCLAW_DB, runId, user.id);
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
      fieldsOfStudy: JSON.parse(paper.fields_of_study_json),
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
      }
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

app.get("/api/runs/:runId/edges", async (c) => {
  const user = await Auth.resolveUser(c);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("runId");
  const run = await Db.getRunOwned(c.env.ALEXCLAW_DB, runId, user.id);
  if (!run) {
    return json({ error: "Run not found" }, 404);
  }

  const edges = await Db.listRunEdgesOwned(c.env.ALEXCLAW_DB, runId, user.id);
  return json({
    edges: edges.map((edge) => ({
      id: edge.edge_id,
      sourceOpenalexId: edge.source_openalex_id,
      sourceTitle: edge.source_title,
      targetOpenalexId: edge.target_openalex_id,
      targetTitle: edge.target_title,
      type: edge.edge_type,
      weight: edge.weight,
      evidence: JSON.parse(edge.evidence_json)
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
      detail: JSON.parse(entry.detail_json),
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
    batch: { messages: Array<{ body: unknown; ack(): void; retry(): void }> },
    env: Env
  ): Promise<void> {
    for (const message of batch.messages) {
      try {
        const payload =
          typeof message.body === "string" ? JSON.parse(message.body) : (message.body as { runId?: string });
        const runId = payload?.runId;
        if (!runId) {
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

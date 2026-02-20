# Alexclaw (Cloudflare Serverless)

Production-oriented MVP for thesis-to-paper-graph using:

- Cloudflare Workers (API + UI)
- Cloudflare Queues (run dispatch)
- Cloudflare Workflows (pipeline orchestration)
- Cloudflare D1 (persistence)

## Features

- Google OAuth login + secure session cookie auth
- Ownership checks on all thesis/run routes
- Thesis intake and asynchronous run creation
- Pipeline with:
  - OpenAI Responses API strict-JSON steps
  - Semantic Scholar search
  - OpenAlex canonicalization + graph expansion
  - Relevance scoring + tiering
  - Asynchronous Unpaywall PDF enrichment via queue
- Traceable run evidence and step audit trail
- Minimal UI to inspect papers/authors/edges
- Global Semantic Scholar throttle at 1 request/second (D1-backed lease)
- Semantic Scholar query generation aligned with Graph API rules (plain text, no boolean syntax, no hyphenated terms)

## Project Layout

- `src/index.ts`: worker fetch routes, queue consumer, workflow class export
- `src/lib/db.ts`: D1 repository and ownership-safe queries
- `src/lib/pipeline.ts`: end-to-end run pipeline
- `src/lib/prompts.ts`: centralized LLM prompts/templates
- `src/providers/scholarly.ts`: centralized Semantic Scholar + OpenAlex call assembly
- `src/providers/live.ts`: live provider adapters (OpenAI + Unpaywall, plus scholarly provider wiring)
- `src/ui/index.ts`: app UI HTML
- `migrations/0001_init.sql`: D1 schema
- `fixtures/mock-theses.json`: reusable thesis fixtures for live testing
- `scripts/run-live-debug.ts`: local live-debug harness with full API logs
- `wrangler.jsonc`: Cloudflare bindings/config

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Configure env

```bash
cp .env.example .env
```

Google callback URL is derived automatically from request origin (`https://<host>/auth/google/callback`).

3. Create D1 database and queues in Cloudflare (one time)

```bash
wrangler d1 create alexclaw
wrangler queues create alexclaw-runs
wrangler queues create alexclaw-enrichment
```

4. Put generated D1 `database_id` into `wrangler.jsonc`.

5. Apply schema locally for development

```bash
npm run d1:migrate:local
```

6. Start worker

```bash
npm run dev
```

## Local Live Debug Loop

Run the real external workflow locally (no mock provider) with thesis fixtures:

```bash
cp .env.example .env
# fill OPENAI_API_KEY, SEMANTIC_SCHOLAR_API_KEY, OPENALEX_API_KEY (and optionally UNPAYWALL_EMAIL)
# required: set OPENAI_PROMPT_ID_QUERY_PLAN / OPENAI_PROMPT_ID_SEED_SELECTION
npm run debug:live -- --list
npm run debug:live -- --thesis-id business-ai-pricing
npm run debug:live:all
```

Artifacts are written under `debug-runs/<timestamp>/<thesis-id>/`:

- `thesis.json`: selected fixture text
- `http.log.ndjson`: full outbound API requests and responses
- `steps.json`: raw outputs per pipeline step
- `result.json`: summary, scored papers, and enrichment attempts for all DOI papers

The runner applies retries with adaptive backoff for transient failures and API rate limits, iteratively shortens the query terms when no seeds are selected, and simulates queued Unpaywall retries.

## Deploy

1. Set secrets:

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put INTERNAL_API_TOKEN
wrangler secret put SEMANTIC_SCHOLAR_API_KEY
wrangler secret put OPENALEX_API_KEY
wrangler secret put UNPAYWALL_EMAIL
```

Prompt configs (non-secret, set as vars) to use saved OpenAI prompts with direct `input` text:

- `OPENAI_PROMPT_ID_QUERY_PLAN`
- `OPENAI_PROMPT_VERSION_QUERY_PLAN` (optional; omit to use current published version)
- `OPENAI_PROMPT_ID_SEED_SELECTION`
- `OPENAI_PROMPT_VERSION_SEED_SELECTION` (optional; omit to use current published version)

2. Deploy (runs remote D1 migrations automatically, then deploys):

```bash
npm run deploy
```

## Worker Bindings

Configured in `wrangler.jsonc`:

- `ALEXCLAW_DB`: D1 database binding
- `ALEXCLAW_RUN_QUEUE`: queue producer binding
- `ALEXCLAW_ENRICH_QUEUE`: queue producer binding
- queue consumer for `alexclaw-runs`
- queue consumer for `alexclaw-enrichment` (asynchronous Unpaywall enrichment)
- `ALEXCLAW_RUN_WORKFLOW`: workflow binding (`AlexclawRunWorkflow` class)

## API Routes

Auth:

- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Core:

- `GET /api/theses`
- `POST /api/theses`
- `POST /api/theses/:thesisId/runs`
- `GET /api/runs`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/papers`
- `GET /api/runs/:runId/authors`
- `GET /api/runs/:runId/edges`
- `GET /api/runs/:runId/evidence`

Run responses include `enrichment` counters (`enqueued`, `completed`, `found`, `notFound`, `failed`, `pending`) so queued Unpaywall progress is visible even after the main graph run reaches `COMPLETED`.

Ops:

- `GET /internal/health` (requires `Authorization: Bearer $INTERNAL_API_TOKEN` or `x-internal-token`)
- `GET /internal/metrics` (requires `Authorization: Bearer $INTERNAL_API_TOKEN` or `x-internal-token`)

## Verification

```bash
npm run verify
```

Runs typecheck + tests.

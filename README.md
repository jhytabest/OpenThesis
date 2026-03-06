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
- Fully BYOK LLM runtime (OpenAI / OpenRouter / Gemini / Claude)
- Pipeline with:
  - Provider-agnostic structured JSON reasoning steps
  - OpenAlex search (Semantic Scholar fallback on OpenAlex quota/rate exhaustion)
  - OpenAlex canonicalization + one-generation graph expansion
  - Relevance scoring and ranking
  - Asynchronous Unpaywall PDF enrichment via queue
- Traceable run evidence and step audit trail
- Minimal UI to inspect papers/authors
- OpenAlex global API ceiling is 100 requests/second across calls
- Global Semantic Scholar fallback throttle at 1 request/second (D1-backed lease)
- Seed query generation uses plain-text terms (no boolean syntax)

## Project Layout

- `src/index.ts`: worker fetch routes, queue consumer, workflow class export
- `src/lib/db.ts`: D1 repository and ownership-safe queries
- `src/lib/pipeline.ts`: end-to-end run pipeline
- `src/lib/prompts.ts`: centralized LLM prompts/templates
- `src/providers/scholarly.ts`: centralized OpenAlex + Semantic Scholar call assembly
- `src/providers/live.ts`: live provider adapters (BYOK reasoning + Unpaywall + scholarly provider wiring)
- `frontend/src/App.tsx`: frontend app shell + auth-aware routing
- `frontend/src/lib/api/*`: typed browser API client modules
- `vite.config.ts`: frontend build configuration
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

This command builds the Carbon frontend (`dist/client`) before starting the Worker.

## Local Live Debug Loop

Run the real external workflow locally (no mock provider) with thesis fixtures:

```bash
cp .env.example .env
# fill BYOK_PROVIDER, BYOK_API_KEY, OPENALEX_API_KEY, and SEMANTIC_SCHOLAR_API_KEY (plus optionally UNPAYWALL_EMAIL)
# for app runtime, BYOK is configured per user in Account settings
npm run debug:live -- --list
npm run debug:live -- --thesis-id deeptech-team-composition
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
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put ENCRYPTION_KEY
wrangler secret put INTERNAL_API_TOKEN
wrangler secret put SEMANTIC_SCHOLAR_API_KEY
wrangler secret put OPENALEX_API_KEY
wrangler secret put UNPAYWALL_EMAIL
```

2. Deploy (runs remote D1 migrations automatically, then deploys):

```bash
npm run deploy
```

## Worker Bindings

Configured in `wrangler.jsonc`:

- `ALEXCLAW_DB`: D1 database binding
- `ALEXCLAW_RUN_QUEUE`: queue producer binding
- `ALEXCLAW_ENRICH_QUEUE`: queue producer binding
- `ALEXCLAW_ARTIFACTS`: R2 bucket binding for snapshot/run artifacts
- queue consumer for `alexclaw-runs`
- queue consumer for `alexclaw-enrichment` (asynchronous Unpaywall enrichment)
- `ALEXCLAW_RUN_WORKFLOW`: workflow binding (`AlexclawRunWorkflow` class)

## API Routes

Auth:

- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Settings:

- `GET /api/settings/byok`
- `PUT /api/settings/byok`
- `DELETE /api/settings/byok`

Core:

- `GET /api/projects`
- `GET /api/projects/:projectId`
- `POST /api/projects`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`
- `POST /api/projects/:projectId/runs`
- `GET /api/projects/:projectId/runs`
- `GET /api/projects/:projectId/runs/:runId`
- `GET /api/projects/:projectId/runs/:runId/audit`
- `GET /api/projects/:projectId/runs/:runId/artifacts`
- `GET /api/projects/:projectId/dashboard`
- `GET /api/projects/:projectId/memory-docs`
- `PATCH /api/projects/:projectId/memory-docs/:docKey`

Workspace:

- `GET /api/projects/:projectId/integrations/google`
- `GET /api/projects/:projectId/integrations/google/connect`
- `GET /api/projects/:projectId/integrations/google/callback`
- `POST /api/projects/:projectId/integrations/google/root`
- `POST /api/projects/:projectId/sync`
- `GET /api/projects/:projectId/documents`
- `PATCH /api/projects/:projectId/documents/:documentId`
- `GET /api/projects/:projectId/documents/:documentId/snapshots`

Chats:

- `GET /api/projects/:projectId/chats`
- `POST /api/projects/:projectId/chats`
- `PATCH /api/projects/:projectId/chats/:chatId`
- `DELETE /api/projects/:projectId/chats/:chatId`
- `GET /api/projects/:projectId/chats/:chatId/messages`
- `POST /api/projects/:projectId/chats/:chatId/messages`

Papers:

- `GET /api/projects/:projectId/papers`
- `POST /api/projects/:projectId/papers`
- `PATCH /api/projects/:projectId/papers/:projectPaperId`
- `DELETE /api/projects/:projectId/papers/:projectPaperId`
- `GET /api/projects/:projectId/reading-list`
- `GET /api/projects/:projectId/papers/:projectPaperId/comments`
- `POST /api/projects/:projectId/papers/:projectPaperId/comments`
- `DELETE /api/projects/:projectId/papers/:projectPaperId/comments/:commentId`

Ops:

- `GET /internal/health` (requires `Authorization: Bearer $INTERNAL_API_TOKEN` or `x-internal-token`)
- `GET /internal/metrics` (requires `Authorization: Bearer $INTERNAL_API_TOKEN` or `x-internal-token`)

## Verification

```bash
npm run verify
```

Runs typecheck + tests.

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
  - Semantic Scholar search + recommendations
  - OpenAlex canonicalization + graph expansion
  - Relevance scoring + tiering
  - Unpaywall PDF enrichment
- Traceable run evidence and step audit trail
- Minimal UI to inspect papers/authors/edges

## Project Layout

- `src/index.ts`: worker fetch routes, queue consumer, workflow class export
- `src/lib/db.ts`: D1 repository and ownership-safe queries
- `src/lib/pipeline.ts`: end-to-end run pipeline
- `src/providers/`: live + mock provider adapters
- `src/ui/index.ts`: app UI HTML
- `migrations/0001_init.sql`: D1 schema
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

3. Create D1 database and queue in Cloudflare (one time)

```bash
wrangler d1 create alexclaw
wrangler queues create alexclaw-runs
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

## Deploy

1. Set secrets:

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
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
- queue consumer for `alexclaw-runs`
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

Ops:

- `GET /internal/health`
- `GET /internal/metrics`

## Verification

```bash
npm run verify
```

Runs typecheck + tests.

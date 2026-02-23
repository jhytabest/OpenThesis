import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import theses from "../fixtures/mock-theses.json";
import { scorePaper } from "../src/lib/scoring.js";
import { seedSelectionSchema } from "../src/lib/zod-schemas.js";
import type {
  CandidatePaper,
  CanonicalPaper,
  Env,
  PaperCitation,
  SeedSelectionAttemptHistory,
  SeedSelectionQueryHistoryEntry
} from "../src/lib/types.js";
import { buildLiveProviders } from "../src/providers/live.js";

type ThesisFixture = {
  id: string;
  domain: string;
  title: string;
  text: string;
};

type CliOptions = {
  thesisId?: string;
  runAll: boolean;
};

const now = (): string => new Date().toISOString();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const SEMANTIC_SCHOLAR_MIN_INTERVAL_MS = 1000;
const LOCAL_RATE_LIMIT_DIR = path.join(projectRoot, ".tmp");
const LOCAL_RATE_LIMIT_STATE_FILE = path.join(
  LOCAL_RATE_LIMIT_DIR,
  "semantic-scholar-rate-limit.json"
);
const LOCAL_RATE_LIMIT_LOCK_DIR = path.join(
  LOCAL_RATE_LIMIT_DIR,
  "semantic-scholar-rate-limit.lock"
);
const LOCAL_RATE_LIMIT_STALE_LOCK_MS = 30_000;
let processNextSemanticScholarAllowedAt = 0;

const dedupeBy = <T>(items: T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push(item);
  }
  return output;
};

const buildInternalCitationLinks = (papers: CanonicalPaper[]): PaperCitation[] => {
  const paperIdSet = new Set(papers.map((paper) => paper.openalexId).filter(Boolean));
  const links: PaperCitation[] = [];
  for (const paper of papers) {
    for (const targetOpenalexId of paper.referencedOpenalexIds) {
      if (!targetOpenalexId || !paperIdSet.has(targetOpenalexId)) {
        continue;
      }
      links.push({
        sourceOpenalexId: paper.openalexId,
        targetOpenalexId
      });
    }
  }
  return dedupeBy(links, (link) => `${link.sourceOpenalexId}|${link.targetOpenalexId}`);
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
const MIN_REQUIRED_SEEDS = 1;
const MIN_QUERY_TERMS = 3;
const SELECTION_WINDOW = 30;

const ensureLocalRateLimitDir = (): void => {
  fs.mkdirSync(LOCAL_RATE_LIMIT_DIR, { recursive: true });
};

const tryBreakStaleLock = (): void => {
  try {
    const lockStats = fs.statSync(LOCAL_RATE_LIMIT_LOCK_DIR);
    if (Date.now() - lockStats.mtimeMs > LOCAL_RATE_LIMIT_STALE_LOCK_MS) {
      fs.rmSync(LOCAL_RATE_LIMIT_LOCK_DIR, { recursive: true, force: true });
    }
  } catch {
    // Lock does not exist or cannot be read; continue normal acquisition loop.
  }
};

const acquireLocalRateLimitLock = async (): Promise<void> => {
  ensureLocalRateLimitDir();
  while (true) {
    try {
      fs.mkdirSync(LOCAL_RATE_LIMIT_LOCK_DIR);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw error;
      }
      tryBreakStaleLock();
      await sleep(25);
    }
  }
};

const releaseLocalRateLimitLock = (): void => {
  fs.rmSync(LOCAL_RATE_LIMIT_LOCK_DIR, { recursive: true, force: true });
};

const readSharedNextAllowedAt = (): number => {
  try {
    const raw = fs.readFileSync(LOCAL_RATE_LIMIT_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as { nextAllowedAtMs?: number };
    return Number(parsed.nextAllowedAtMs ?? 0);
  } catch {
    return 0;
  }
};

const writeSharedNextAllowedAt = (nextAllowedAtMs: number): void => {
  fs.writeFileSync(
    LOCAL_RATE_LIMIT_STATE_FILE,
    `${JSON.stringify({ nextAllowedAtMs, updatedAt: now(), pid: process.pid })}\n`,
    "utf8"
  );
};

const acquireGlobalSemanticScholarSlot = async (): Promise<void> => {
  while (true) {
    await acquireLocalRateLimitLock();
    let waitMs = 0;
    try {
      const nowMs = Date.now();
      const sharedNextAllowedAt = readSharedNextAllowedAt();
      const nextAllowedAt = Math.max(processNextSemanticScholarAllowedAt, sharedNextAllowedAt);
      if (nextAllowedAt > nowMs) {
        waitMs = nextAllowedAt - nowMs;
      } else {
        const next = nowMs + SEMANTIC_SCHOLAR_MIN_INTERVAL_MS;
        processNextSemanticScholarAllowedAt = next;
        writeSharedNextAllowedAt(next);
        return;
      }
    } finally {
      releaseLocalRateLimitLock();
    }
    await sleep(waitMs);
  }
};

const withSemanticScholarRateLimit = async <T>(fn: () => Promise<T>): Promise<T> => {
  await acquireGlobalSemanticScholarSlot();
  return fn();
};

const normalizeQueryTerms = (terms: string[]): string[] =>
  terms
    .map((term) => term.trim())
    .filter(Boolean);

const withRetries = async <T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> => {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[retry] ${label} attempt ${attempt} failed: ${message}`);
      const delayMs = message.includes("429") ? 5_000 * attempt : 500 * attempt;
      await sleep(delayMs);
    }
  }
  throw new Error(`Unreachable retry state for ${label}`);
};

const isOpenAlexQuotaOrRateExhaustionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("(402)") ||
    message.includes("(429)") ||
    /quota|credit|rate limit|too many requests/i.test(message)
  );
};

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const out: CliOptions = { runAll: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--all") {
      out.runAll = true;
      continue;
    }
    if (arg === "--thesis-id") {
      out.thesisId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--list") {
      console.log("Available thesis fixtures:");
      for (const thesis of theses as ThesisFixture[]) {
        console.log(`- ${thesis.id} (${thesis.domain}): ${thesis.title}`);
      }
      process.exit(0);
    }
  }
  return out;
};

const loadEnvFile = (envPath: string): Record<string, string> => {
  if (!fs.existsSync(envPath)) {
    return {};
  }
  const raw = fs.readFileSync(envPath, "utf8");
  const output: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    output[key] = value;
  }
  return output;
};

const requireEnv = (env: Record<string, string>, name: string): string => {
  const value = process.env[name] ?? env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const optionalEnv = (env: Record<string, string>, name: string): string | undefined =>
  process.env[name] ?? env[name];

const redactHeaders = (headers: Headers): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower === "x-api-key") {
      output[key] = "REDACTED";
      continue;
    }
    output[key] = value;
  }
  return output;
};

const redactUrl = (value: string): string => {
  try {
    const url = new URL(value);
    for (const [key] of url.searchParams.entries()) {
      const lower = key.toLowerCase();
      if (lower.includes("key") || lower.includes("token") || lower.includes("secret")) {
        url.searchParams.set(key, "REDACTED");
      }
    }
    return url.toString();
  } catch {
    return value;
  }
};

const createHttpLogger = (runDir: string): { install(): void; restore(): void } => {
  const logPath = path.join(runDir, "http.log.ndjson");
  const originalFetch = globalThis.fetch;
  let counter = 0;

  const writeLog = (entry: unknown): void => {
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
  };

  const wrappedFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    counter += 1;
    const callId = counter;
    const request = new Request(input, init);
    const requestBody = await request.clone().text().catch(() => "");
    const startedAt = Date.now();

    try {
      const response = await originalFetch(request);
      const responseBody = await response.clone().text().catch(() => "");
      writeLog({
        callId,
        timestamp: now(),
        method: request.method,
        url: redactUrl(request.url),
        requestHeaders: redactHeaders(request.headers),
        requestBody,
        responseStatus: response.status,
        responseHeaders: redactHeaders(response.headers),
        responseBody,
        durationMs: Date.now() - startedAt
      });
      return response;
    } catch (error) {
      writeLog({
        callId,
        timestamp: now(),
        method: request.method,
        url: redactUrl(request.url),
        requestHeaders: redactHeaders(request.headers),
        requestBody,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt
      });
      throw error;
    }
  };

  return {
    install(): void {
      globalThis.fetch = wrappedFetch;
    },
    restore(): void {
      globalThis.fetch = originalFetch;
    }
  };
};

const writeJson = (filePath: string, value: unknown): void => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const executeLiveFlow = async (input: {
  thesis: ThesisFixture;
  providers: ReturnType<typeof buildLiveProviders>;
  runDir: string;
}): Promise<void> => {
  const { thesis, providers, runDir } = input;
  const stepData: Record<string, unknown> = {};

  const thesisSummary = await withRetries("llm_thesis_summary", () =>
    providers.reasoning.summarizeThesis(thesis.text)
  );
  stepData.thesisSummary = thesisSummary;

  const queryGeneration = await withRetries("llm_query_generation", () =>
    providers.reasoning.generateQuery({
      thesisTitle: thesisSummary.thesis_title,
      thesisSummary: thesisSummary.thesis_summary
    })
  );
  stepData.queryGeneration = queryGeneration;

  let activeQueryTerms = normalizeQueryTerms(queryGeneration.terms);
  let activeQuery = activeQueryTerms.join(" ");
  let activeQuerySource: SeedSelectionQueryHistoryEntry["source"] = "query_generation";
  let seedSelection: Awaited<ReturnType<typeof providers.reasoning.selectSeeds>> | null = null;
  let selectedSeedCandidates: CandidatePaper[] = [];
  const queryHistory: SeedSelectionQueryHistoryEntry[] = [];
  const selectionHistory: SeedSelectionAttemptHistory[] = [];
  let mergedCandidates: CandidatePaper[] = [];
  let initialCandidates: CandidatePaper[] = [];
  const maxSelectionAttempts = Math.max(1, activeQueryTerms.length - MIN_QUERY_TERMS + 1);

  for (let attempt = 1; attempt <= maxSelectionAttempts; attempt += 1) {
    activeQuery = activeQueryTerms.join(" ");
    let searchResults: CandidatePaper[];
    let searchProvider: "openalex.search" | "semantic_scholar.search" = "openalex.search";
    try {
      searchResults = await withRetries(`openalex_search_attempt_${attempt}`, () =>
        providers.openAlex.search(activeQuery, queryGeneration.fields_of_study, SELECTION_WINDOW)
      );
    } catch (error) {
      if (!isOpenAlexQuotaOrRateExhaustionError(error)) {
        throw error;
      }
      console.warn(`[fallback] openalex search exhausted at attempt ${attempt}; switching to semantic scholar`);
      searchProvider = "semantic_scholar.search";
      searchResults = await withRetries(`semantic_search_fallback_attempt_${attempt}`, () =>
        withSemanticScholarRateLimit(() =>
          providers.semanticScholar.search(activeQuery, queryGeneration.fields_of_study, SELECTION_WINDOW)
        )
      );
    }
    const rankedCandidates = dedupeBy(searchResults, (paper) => paper.paperId).slice(
      0,
      SELECTION_WINDOW
    );
    const searchSnapshot = {
      query: activeQuery,
      fields_of_study: queryGeneration.fields_of_study,
      total_hits: searchResults.length
    };
    const queryHistoryEntry: SeedSelectionQueryHistoryEntry = {
      query_index: queryHistory.length,
      source: activeQuerySource,
      search: searchSnapshot
    };
    queryHistory.push(queryHistoryEntry);
    stepData[`searchAttempt${attempt}`] = {
      provider: searchProvider,
      query: activeQuery,
      totalResults: searchResults.length,
      selectionCandidates: rankedCandidates.length
    };

    if (attempt === 1) {
      initialCandidates = searchResults;
    }
    mergedCandidates = rankedCandidates;

    if (searchResults.length === 0) {
      const nextQueryTerms =
        activeQueryTerms.length > MIN_QUERY_TERMS
          ? activeQueryTerms.slice(1)
          : null;
      seedSelection = seedSelectionSchema.parse({ outcome: "empty" });
      selectionHistory.push({
        attempt,
        query_index: queryHistoryEntry.query_index,
        decision: {
          outcome: "empty",
          selected_candidate_indices: [],
          revised_query: nextQueryTerms ? nextQueryTerms.join(" ") : null
        }
      });
      if (!nextQueryTerms) {
        break;
      }
      activeQueryTerms = nextQueryTerms;
      activeQuerySource = "drop_first";
      continue;
    }

    const candidateById = new Map(rankedCandidates.map((candidate) => [candidate.paperId, candidate]));
    const candidateIndexById = new Map(
      rankedCandidates.map((candidate, candidateIndex) => [candidate.paperId, candidateIndex])
    );
    const attemptSelection = await withRetries(`llm_select_seeds_attempt_${attempt}`, () =>
      providers.reasoning.selectSeeds({
        thesisTitle: thesisSummary.thesis_title,
        thesisSummary: thesisSummary.thesis_summary,
        candidates: rankedCandidates
      })
    );
    stepData[`seedSelectionAttempt${attempt}`] = attemptSelection;

    let selectedCandidateIndices: number[] = [];
    seedSelection = attemptSelection;
    if (attemptSelection.outcome === "selected") {
      selectedSeedCandidates = dedupeBy(
        attemptSelection.paper_ids
          .map((paperId) => candidateById.get(paperId))
          .filter((candidate): candidate is CandidatePaper => Boolean(candidate)),
        (candidate) => candidate.paperId
      );
      selectedCandidateIndices = attemptSelection.paper_ids
        .map((paperId) => candidateIndexById.get(paperId))
        .filter((candidateIndex): candidateIndex is number => candidateIndex !== undefined);
      selectionHistory.push({
        attempt,
        query_index: queryHistoryEntry.query_index,
        decision: {
          outcome: "selected",
          selected_candidate_indices: selectedCandidateIndices,
          revised_query: null
        }
      });
      if (selectedSeedCandidates.length >= MIN_REQUIRED_SEEDS) {
        break;
      }
    } else {
      const nextQueryTerms =
        activeQueryTerms.length > MIN_QUERY_TERMS
          ? activeQueryTerms.slice(0, activeQueryTerms.length - 1)
          : null;
      selectionHistory.push({
        attempt,
        query_index: queryHistoryEntry.query_index,
        decision: {
          outcome: "empty",
          selected_candidate_indices: [],
          revised_query: nextQueryTerms ? nextQueryTerms.join(" ") : null
        }
      });
      if (!nextQueryTerms) {
        break;
      }
      activeQueryTerms = nextQueryTerms;
      activeQuerySource = "drop_last";
    }
  }

  stepData.initialCandidates = initialCandidates;
  stepData.mergedCandidatesCount = mergedCandidates.length;
  if (!seedSelection) {
    throw new Error("llm_select_seeds did not return a selection payload");
  }
  stepData.selectionHistory = selectionHistory;
  stepData.queryHistory = queryHistory;
  stepData.seedSelection = seedSelection;

  if (seedSelection.outcome !== "selected" || selectedSeedCandidates.length < MIN_REQUIRED_SEEDS) {
    throw new Error(
      `llm_select_seeds did not produce at least ${MIN_REQUIRED_SEEDS} seeds after ${maxSelectionAttempts} attempts`
    );
  }
  const seedsToResolve = selectedSeedCandidates;
  stepData.seedIds = seedsToResolve.map((seed) => seed.paperId);

  const canonicalSeeds = await withRetries("openalex_resolve", () =>
    providers.openAlex.resolveSeeds(seedsToResolve)
  );
  if (canonicalSeeds.length === 0) {
    throw new Error("openalex_resolve returned 0 canonical seeds");
  }
  stepData.canonicalSeeds = canonicalSeeds;

  const expanded = await withRetries("openalex_expand", () =>
    providers.openAlex.expandGraph(canonicalSeeds)
  );
  stepData.expandedCounts = { papers: expanded.papers.length };

  const allPapers = dedupeBy<CanonicalPaper>(
    [...expanded.papers, ...canonicalSeeds].filter((paper) => paper.openalexId.length > 0),
    (paper) => paper.openalexId
  );
  if (allPapers.length === 0) {
    throw new Error("graph expansion resulted in 0 papers");
  }
  const citationLinks = buildInternalCitationLinks(allPapers);

  const seedIds = new Set(canonicalSeeds.map((seed) => seed.openalexId));
  const scored = allPapers
    .map((paper) => ({
      ...paper,
      score: scorePaper({
        thesisText: thesis.text,
        title: paper.title,
        abstract: paper.abstract,
        citationCount: paper.citationCount,
        paperId: paper.openalexId,
        seedIds,
        citations: citationLinks
      })
    }))
    .sort((a, b) => b.score.totalScore - a.score.totalScore);

  const enrichmentJobs = scored
    .filter((paper) => Boolean(paper.doi))
    .map((paper) => ({ openalexId: paper.openalexId, doi: paper.doi! }));
  const enrichment = [];
  const enrichQueueMaxAttempts = 4;
  stepData.enqueueUnpaywallEnrichment = { enqueuedCount: enrichmentJobs.length };
  for (const job of enrichmentJobs) {
    let processed = false;
    for (let attempt = 1; attempt <= enrichQueueMaxAttempts; attempt += 1) {
      try {
        const access = await withRetries(
          "unpaywall_lookup",
          () => providers.unpaywall.lookupByDoi(job.doi),
          2
        );
        enrichment.push({
          openalexId: job.openalexId,
          doi: job.doi,
          status: "completed",
          attempts: attempt,
          found: Boolean(access),
          access
        });
        processed = true;
        break;
      } catch (error) {
        if (attempt >= enrichQueueMaxAttempts) {
          enrichment.push({
            openalexId: job.openalexId,
            doi: job.doi,
            status: "failed",
            attempts: attempt,
            found: false,
            error: error instanceof Error ? error.message : String(error)
          });
          processed = true;
          break;
        }
      }
    }
    if (!processed) {
      enrichment.push({
        openalexId: job.openalexId,
        doi: job.doi,
        status: "failed",
        attempts: enrichQueueMaxAttempts,
        found: false,
        error: "Unpaywall enrichment did not reach a terminal state"
      });
    }
  }

  const summary = {
    thesis: {
      id: thesis.id,
      domain: thesis.domain,
      title: thesis.title,
      textLength: thesis.text.length
    },
    counts: {
      initialCandidates: initialCandidates.length,
      mergedCandidates: mergedCandidates.length,
      selectedSeeds: seedsToResolve.length,
      canonicalSeeds: canonicalSeeds.length,
      graphPapers: allPapers.length,
      citationLinks: citationLinks.length,
      enrichmentEnqueued: enrichmentJobs.length,
      enrichmentCompleted: enrichment.filter((entry) => entry.status === "completed").length,
      enrichmentFailed: enrichment.filter((entry) => entry.status === "failed").length
    },
    thesisSummary,
    queryGeneration,
    finalQuery: activeQuery,
    selectedSeedPaperIds: seedsToResolve.map((seed) => seed.paperId),
    topPapers: scored.slice(0, 15).map((paper) => ({
      openalexId: paper.openalexId,
      title: paper.title,
      year: paper.year,
      citationCount: paper.citationCount,
      totalScore: paper.score.totalScore,
      doi: paper.doi
    })),
    enrichment
  };

  writeJson(path.join(runDir, "steps.json"), stepData);
  writeJson(path.join(runDir, "result.json"), summary);
  console.log(
    `[${thesis.id}] done: ${summary.counts.graphPapers} papers, ${summary.counts.citationLinks} citation links, top="${summary.topPapers[0]?.title ?? "n/a"}"`
  );
};

const run = async (): Promise<void> => {
  const options = parseArgs();
  const fixtures = theses as ThesisFixture[];
  const defaultThesisId = fixtures[0]?.id;

  const selected = options.runAll
    ? fixtures
    : fixtures.filter((thesis) =>
        options.thesisId ? thesis.id === options.thesisId : thesis.id === defaultThesisId
      );

  if (selected.length === 0) {
    throw new Error("No thesis fixture selected. Use --list to see available IDs.");
  }

  const envFile = path.join(projectRoot, ".env");
  const env = loadEnvFile(envFile);

  const openAiApiKey = requireEnv(env, "OPENAI_API_KEY");
  const semanticScholarApiKey = requireEnv(env, "SEMANTIC_SCHOLAR_API_KEY");
  const openAlexApiKey = requireEnv(env, "OPENALEX_API_KEY");
  const googleClientId = optionalEnv(env, "GOOGLE_CLIENT_ID");
  const googleClientSecret = optionalEnv(env, "GOOGLE_CLIENT_SECRET");
  const unpaywallEmail = optionalEnv(env, "UNPAYWALL_EMAIL");
  const openAiPromptIdThesisSummary = requireEnv(env, "OPENAI_PROMPT_ID_THESIS_SUMMARY");
  const openAiPromptVersionThesisSummary = optionalEnv(env, "OPENAI_PROMPT_VERSION_THESIS_SUMMARY");
  const openAiPromptIdQueryGeneration = requireEnv(env, "OPENAI_PROMPT_ID_QUERY_GENERATION");
  const openAiPromptVersionQueryGeneration = optionalEnv(
    env,
    "OPENAI_PROMPT_VERSION_QUERY_GENERATION"
  );
  const openAiPromptIdSeedSelection = requireEnv(env, "OPENAI_PROMPT_ID_SEED_SELECTION");
  const openAiPromptVersionSeedSelection = optionalEnv(
    env,
    "OPENAI_PROMPT_VERSION_SEED_SELECTION"
  );

  const providerEnv = {
    OPENAI_API_KEY: openAiApiKey,
    OPENAI_PROMPT_ID_THESIS_SUMMARY: openAiPromptIdThesisSummary,
    OPENAI_PROMPT_VERSION_THESIS_SUMMARY: openAiPromptVersionThesisSummary,
    OPENAI_PROMPT_ID_QUERY_GENERATION: openAiPromptIdQueryGeneration,
    OPENAI_PROMPT_VERSION_QUERY_GENERATION: openAiPromptVersionQueryGeneration,
    OPENAI_PROMPT_ID_SEED_SELECTION: openAiPromptIdSeedSelection,
    OPENAI_PROMPT_VERSION_SEED_SELECTION: openAiPromptVersionSeedSelection,
    SEMANTIC_SCHOLAR_API_KEY: semanticScholarApiKey,
    OPENALEX_API_KEY: openAlexApiKey,
    UNPAYWALL_EMAIL: unpaywallEmail,
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret
  } as unknown as Env;

  const providers = buildLiveProviders(providerEnv);

  const sessionId = new Date().toISOString().replace(/[:.]/g, "-");
  const sessionDir = path.join(projectRoot, "debug-runs", sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  console.log(`Session log dir: ${sessionDir}`);
  console.log(
    `Prompt IDs: thesis_summary=${openAiPromptIdThesisSummary}, query_generation=${openAiPromptIdQueryGeneration}, seed_selection=${openAiPromptIdSeedSelection}`
  );
  console.log(`Selected fixtures: ${selected.map((item) => item.id).join(", ")}`);

  for (const thesis of selected) {
    const runDir = path.join(sessionDir, thesis.id);
    fs.mkdirSync(runDir, { recursive: true });
    writeJson(path.join(runDir, "thesis.json"), thesis);

    const logger = createHttpLogger(runDir);
    logger.install();
    try {
      await executeLiveFlow({ thesis, providers, runDir });
    } finally {
      logger.restore();
    }
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

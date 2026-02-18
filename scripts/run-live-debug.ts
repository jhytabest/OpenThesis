import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import theses from "../fixtures/mock-theses.json";
import { scorePaper } from "../src/lib/scoring.js";
import type {
  CandidatePaper,
  CanonicalPaper,
  Env,
  GraphEdge,
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

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
const MIN_REQUIRED_SEEDS = 3;
const MAX_SEED_SELECTION_ATTEMPTS = 3;
const SELECTION_WINDOW = 30;

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
        url: request.url,
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
        url: request.url,
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
  let nextSemanticScholarAllowedAt = 0;

  const withSemanticScholarRateLimit = async <T>(fn: () => Promise<T>): Promise<T> => {
    const nowMs = Date.now();
    if (nextSemanticScholarAllowedAt > nowMs) {
      await sleep(nextSemanticScholarAllowedAt - nowMs);
    }
    nextSemanticScholarAllowedAt = Date.now() + 1000;
    return fn();
  };

  const queryPlan = await withRetries("llm_query_plan", () =>
    providers.reasoning.generateQueryPlan(thesis.text)
  );
  stepData.queryPlan = queryPlan;

  let activeQuery = queryPlan.query;
  let seedSelection: Awaited<ReturnType<typeof providers.reasoning.selectSeeds>> | null = null;
  let selectedSeedCandidates: CandidatePaper[] = [];
  const queryHistory: SeedSelectionQueryHistoryEntry[] = [];
  const selectionHistory: SeedSelectionAttemptHistory[] = [];
  let mergedCandidates: CandidatePaper[] = [];
  let initialCandidates: CandidatePaper[] = [];

  for (let attempt = 1; attempt <= MAX_SEED_SELECTION_ATTEMPTS; attempt += 1) {
    const searchResults = await withRetries(`semantic_search_attempt_${attempt}`, () =>
      withSemanticScholarRateLimit(() =>
        providers.semanticScholar.search(activeQuery, queryPlan.fields_of_study, SELECTION_WINDOW)
      )
    );
    const rankedCandidates = dedupeBy(searchResults, (paper) => paper.paperId).slice(
      0,
      SELECTION_WINDOW
    );
    const topHits = rankedCandidates.slice(0, 5).map((candidate, candidateIndex) => ({
      candidate_index: candidateIndex,
      paper_id: candidate.paperId,
      title: candidate.title,
      year: candidate.year ?? null,
      citation_count: candidate.citationCount ?? null,
      fields_of_study: candidate.fieldsOfStudy
    }));
    const searchSnapshot = {
      query: activeQuery,
      fields_of_study: queryPlan.fields_of_study,
      total_hits: searchResults.length,
      top_hits: topHits
    };
    const queryHistoryEntry: SeedSelectionQueryHistoryEntry = {
      query_index: queryHistory.length,
      source: attempt === 1 ? "query_plan" : "selection_retry",
      search: searchSnapshot
    };
    queryHistory.push(queryHistoryEntry);
    stepData[`searchAttempt${attempt}`] = {
      query: activeQuery,
      totalResults: searchResults.length,
      selectionCandidates: rankedCandidates.length
    };

    if (attempt === 1) {
      initialCandidates = searchResults;
    }
    mergedCandidates = rankedCandidates;

    const candidateById = new Map(rankedCandidates.map((candidate) => [candidate.paperId, candidate]));
    const candidateIndexById = new Map(
      rankedCandidates.map((candidate, candidateIndex) => [candidate.paperId, candidateIndex])
    );
    const attemptSelection = await withRetries(`llm_select_seeds_attempt_${attempt}`, () =>
      providers.reasoning.selectSeeds({
        thesisTitle: queryPlan.thesis_title,
        thesisSummary: queryPlan.thesis_summary,
        candidates: rankedCandidates,
        queryHistory,
        previousAttempts: selectionHistory
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
      selectionHistory.push({
        attempt,
        query_index: queryHistoryEntry.query_index,
        decision: {
          outcome: "retry_query",
          selected_candidate_indices: [],
          revised_query: attemptSelection.revised_query
        }
      });
      activeQuery = attemptSelection.revised_query;
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
      `llm_select_seeds did not produce at least ${MIN_REQUIRED_SEEDS} seeds after ${MAX_SEED_SELECTION_ATTEMPTS} attempts`
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
  stepData.expandedCounts = { papers: expanded.papers.length, edges: expanded.edges.length };

  const allPapers = dedupeBy<CanonicalPaper>(
    [...canonicalSeeds, ...expanded.papers].filter((paper) => paper.openalexId.length > 0),
    (paper) => paper.openalexId
  );
  if (allPapers.length === 0) {
    throw new Error("graph expansion resulted in 0 papers");
  }
  const allEdges = dedupeBy<GraphEdge>(
    expanded.edges.filter((edge) => edge.sourceOpenalexId && edge.targetOpenalexId),
    (edge) => `${edge.sourceOpenalexId}|${edge.targetOpenalexId}|${edge.type}`
  );

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
        edges: allEdges
      })
    }))
    .sort((a, b) => b.score.totalScore - a.score.totalScore);

  const topForEnrichment = scored.filter((paper) => paper.doi).slice(0, 10);
  const enrichment = [];
  for (const paper of topForEnrichment) {
    const access = await withRetries("unpaywall_lookup", () =>
      providers.unpaywall.lookupByDoi(paper.doi!)
    );
    enrichment.push({
      openalexId: paper.openalexId,
      doi: paper.doi,
      access
    });
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
      graphEdges: allEdges.length
    },
    queryPlan,
    finalQuery: activeQuery,
    selectedSeedPaperIds: seedsToResolve.map((seed) => seed.paperId),
    topPapers: scored.slice(0, 15).map((paper) => ({
      openalexId: paper.openalexId,
      title: paper.title,
      year: paper.year,
      citationCount: paper.citationCount,
      tier: paper.score.tier,
      totalScore: paper.score.totalScore,
      doi: paper.doi
    })),
    enrichment
  };

  writeJson(path.join(runDir, "steps.json"), stepData);
  writeJson(path.join(runDir, "result.json"), summary);
  console.log(
    `[${thesis.id}] done: ${summary.counts.graphPapers} papers, ${summary.counts.graphEdges} edges, top="${summary.topPapers[0]?.title ?? "n/a"}"`
  );
};

const run = async (): Promise<void> => {
  const options = parseArgs();
  const fixtures = theses as ThesisFixture[];

  const selected = options.runAll
    ? fixtures
    : fixtures.filter((thesis) => (options.thesisId ? thesis.id === options.thesisId : thesis.id === "business-ai-pricing"));

  if (selected.length === 0) {
    throw new Error("No thesis fixture selected. Use --list to see available IDs.");
  }

  const rootDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(rootDir, "..");
  const envFile = path.join(projectRoot, ".env");
  const env = loadEnvFile(envFile);

  const openAiApiKey = requireEnv(env, "OPENAI_API_KEY");
  const semanticScholarApiKey = requireEnv(env, "SEMANTIC_SCHOLAR_API_KEY");
  const openAlexApiKey = requireEnv(env, "OPENALEX_API_KEY");
  const googleClientId = optionalEnv(env, "GOOGLE_CLIENT_ID");
  const googleClientSecret = optionalEnv(env, "GOOGLE_CLIENT_SECRET");
  const unpaywallEmail = optionalEnv(env, "UNPAYWALL_EMAIL");
  const openAiPromptIdQueryPlan = requireEnv(env, "OPENAI_PROMPT_ID_QUERY_PLAN");
  const openAiPromptVersionQueryPlan = optionalEnv(env, "OPENAI_PROMPT_VERSION_QUERY_PLAN");
  const openAiPromptIdSeedSelection = requireEnv(env, "OPENAI_PROMPT_ID_SEED_SELECTION");
  const openAiPromptVersionSeedSelection = optionalEnv(
    env,
    "OPENAI_PROMPT_VERSION_SEED_SELECTION"
  );

  const providerEnv = {
    OPENAI_API_KEY: openAiApiKey,
    OPENAI_PROMPT_ID_QUERY_PLAN: openAiPromptIdQueryPlan,
    OPENAI_PROMPT_VERSION_QUERY_PLAN: openAiPromptVersionQueryPlan,
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
    `Prompt IDs: query_plan=${openAiPromptIdQueryPlan}, seed_selection=${openAiPromptIdSeedSelection}`
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

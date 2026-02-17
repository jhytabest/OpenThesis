import { Db } from "./db.js";
import { scorePaper } from "./scoring.js";
import type { CanonicalPaper, Env, GraphEdge } from "./types.js";
import { buildProviders } from "../providers/index.js";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const SEMANTIC_SCHOLAR_RATE_LIMIT_KEY = "semantic_scholar_api";
const SEMANTIC_SCHOLAR_MIN_INTERVAL_MS = 1000;

async function withRetries<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  onRetry: (attempt: number, error: unknown) => void
): Promise<T> {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error;
      }
      onRetry(attempt, error);
      const message = error instanceof Error ? error.message : String(error);
      const delayMs = message.includes("429") ? 5_000 * attempt : 500 * attempt;
      await sleep(delayMs);
    }
  }
  throw new Error("unreachable");
}

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

const acquireGlobalRateLimitSlot = async (
  env: Env,
  key: string,
  minIntervalMs: number
): Promise<void> => {
  await Db.ensureGlobalRateLimitKey(env.ALEXCLAW_DB, key);

  while (true) {
    const now = Date.now();
    const nextAllowedAt = await Db.readGlobalRateLimitNextAllowedMs(env.ALEXCLAW_DB, key);
    if (nextAllowedAt > now) {
      await sleep(nextAllowedAt - now);
      continue;
    }

    const claimed = await Db.compareAndSetGlobalRateLimit(
      env.ALEXCLAW_DB,
      key,
      nextAllowedAt,
      now + minIntervalMs
    );
    if (claimed) {
      return;
    }
  }
};

async function runStep<T>(
  env: Env,
  runId: string,
  stepName: string,
  callback: () => Promise<T>
): Promise<T> {
  let attempt = 0;
  while (attempt < 3) {
    attempt += 1;
    const runStepId = await Db.createRunStep(env.ALEXCLAW_DB, runId, stepName, attempt);
    try {
      const result = await callback();
      await Db.completeRunStep(env.ALEXCLAW_DB, runStepId, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await Db.failRunStep(env.ALEXCLAW_DB, runStepId, message);
      if (attempt >= 3) {
        throw error;
      }
    }
  }
  throw new Error("unreachable");
}

export async function processRun(env: Env, runId: string): Promise<void> {
  const providers = buildProviders(env);
  const run = await Db.getRunById(env.ALEXCLAW_DB, runId);
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  const claimed = await Db.markRunRunningIfQueued(env.ALEXCLAW_DB, runId);
  if (!claimed && run.status !== "RUNNING") {
    return;
  }

  const thesis = await Db.getThesisOwned(env.ALEXCLAW_DB, run.thesis_id, run.user_id);
  if (!thesis) {
    await Db.updateRunStatus(env.ALEXCLAW_DB, runId, "FAILED", "Thesis not found for run owner");
    return;
  }

  await Db.clearRunData(env.ALEXCLAW_DB, runId);

  try {
    const queryPlan = await runStep(env, runId, "llm_query_plan", () =>
      withRetries(
        () => providers.reasoning.generateQueryPlan(thesis.text),
        3,
        (attempt, error) => console.warn("llm_query_plan retry", { runId, attempt, error })
      )
    );

    await Db.insertEvidence(env.ALEXCLAW_DB, {
      runId,
      entityType: "run",
      entityId: runId,
      source: "openai.query_plan",
      detail: queryPlan
    });

    const initialCandidates = await runStep(env, runId, "semantic_search", () =>
      withRetries(
        async () => {
          await acquireGlobalRateLimitSlot(
            env,
            SEMANTIC_SCHOLAR_RATE_LIMIT_KEY,
            SEMANTIC_SCHOLAR_MIN_INTERVAL_MS
          );
          return providers.semanticScholar.search(
            queryPlan.query,
            queryPlan.fields_of_study,
            25,
            queryPlan.time_horizon,
            queryPlan.must_terms
          );
        },
        3,
        (attempt, error) => console.warn("semantic_search retry", { runId, attempt, error })
      )
    );

    if (initialCandidates.length === 0) {
      throw new Error("semantic_search returned 0 candidates");
    }

    const triage = await runStep(env, runId, "llm_triage", () =>
      withRetries(
        () => providers.reasoning.triageCandidates(thesis.text, initialCandidates),
        3,
        (attempt, error) => console.warn("llm_triage retry", { runId, attempt, error })
      )
    );

    for (const decision of triage.decisions) {
      await Db.insertEvidence(env.ALEXCLAW_DB, {
        runId,
        entityType: "semantic_scholar_paper",
        entityId: decision.paper_id,
        source: "openai.triage",
        detail: decision
      });
    }

    const positiveIds = triage.decisions
      .filter((decision) => decision.decision === "on_topic")
      .map((decision) => decision.paper_id);

    const negativeIds = triage.decisions
      .filter((decision) => decision.decision === "off_topic")
      .map((decision) => decision.paper_id);

    if (positiveIds.length === 0) {
      throw new Error("llm_triage returned 0 on-topic papers");
    }

    const recommendationCandidates = await runStep(env, runId, "semantic_recommendations", () =>
      withRetries(
        async () => {
          await acquireGlobalRateLimitSlot(
            env,
            SEMANTIC_SCHOLAR_RATE_LIMIT_KEY,
            SEMANTIC_SCHOLAR_MIN_INTERVAL_MS
          );
          return providers.semanticScholar.recommend(positiveIds, negativeIds, 25);
        },
        3,
        (attempt, error) => console.warn("semantic_recommendations retry", {
          runId,
          attempt,
          error
        })
      )
    );

    const mergedCandidates = dedupeBy(
      [...initialCandidates, ...recommendationCandidates],
      (paper) => paper.paperId
    );

    if (mergedCandidates.length === 0) {
      throw new Error("semantic search + recommendations produced 0 merged candidates");
    }

    const seedSelection = await runStep(env, runId, "llm_select_seeds", () =>
      withRetries(
        () => providers.reasoning.selectSeeds(thesis.text, mergedCandidates, triage),
        3,
        (attempt, error) => console.warn("llm_select_seeds retry", { runId, attempt, error })
      )
    );

    await Db.insertEvidence(env.ALEXCLAW_DB, {
      runId,
      entityType: "run",
      entityId: runId,
      source: "openai.seed_selection",
      detail: seedSelection
    });

    const candidateById = new Map(mergedCandidates.map((candidate) => [candidate.paperId, candidate]));
    const selectedSeedCandidates = dedupeBy(
      seedSelection.seeds
        .map((seed) => candidateById.get(seed.paper_id))
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)),
      (candidate) => candidate.paperId
    );

    if (selectedSeedCandidates.length === 0) {
      throw new Error("llm_select_seeds did not map to any candidate paper IDs");
    }
    const seedsToResolve = selectedSeedCandidates;

    const canonicalSeeds = await runStep(env, runId, "openalex_resolve", () =>
      withRetries(
        () => providers.openAlex.resolveSeeds(seedsToResolve),
        3,
        (attempt, error) => console.warn("openalex_resolve retry", { runId, attempt, error })
      )
    );
    if (canonicalSeeds.length === 0) {
      throw new Error("openalex_resolve returned 0 canonical seeds");
    }

    const expanded = await runStep(env, runId, "openalex_expand", () =>
      withRetries(
        () => providers.openAlex.expandGraph(canonicalSeeds),
        3,
        (attempt, error) => console.warn("openalex_expand retry", { runId, attempt, error })
      )
    );

    const allPapers = dedupeBy<CanonicalPaper>(
      [...canonicalSeeds, ...expanded.papers].filter((paper) => paper.openalexId.length > 0),
      (paper) => paper.openalexId
    );
    if (allPapers.length === 0) {
      throw new Error("graph expansion resulted in 0 papers");
    }

    const paperIdByOpenAlexId = new Map<string, string>();

    for (const paper of allPapers) {
      const persistedPaper = await Db.upsertPaper(env.ALEXCLAW_DB, {
        openalexId: paper.openalexId,
        semanticScholarId: paper.semanticScholarId,
        doi: paper.doi,
        title: paper.title,
        abstract: paper.abstract,
        year: paper.year,
        citationCount: paper.citationCount,
        fieldsOfStudy: paper.fieldsOfStudy
      });

      paperIdByOpenAlexId.set(paper.openalexId, persistedPaper.id);

      for (const [index, author] of paper.authors.entries()) {
        const persistedAuthor = await Db.upsertAuthor(env.ALEXCLAW_DB, {
          openalexId: author.openalexId,
          name: author.name,
          orcid: author.orcid
        });
        await Db.linkPaperAuthor(env.ALEXCLAW_DB, {
          paperId: persistedPaper.id,
          authorId: persistedAuthor.id,
          authorPosition: index + 1
        });
      }

      await Db.insertEvidence(env.ALEXCLAW_DB, {
        runId,
        entityType: "paper",
        entityId: paper.openalexId,
        source: "openalex.work",
        detail: {
          openalexId: paper.openalexId,
          title: paper.title,
          doi: paper.doi
        }
      });
    }

    const validEdges = dedupeBy<GraphEdge>(
      expanded.edges.filter(
        (edge) =>
          paperIdByOpenAlexId.has(edge.sourceOpenalexId) &&
          paperIdByOpenAlexId.has(edge.targetOpenalexId)
      ),
      (edge) => `${edge.sourceOpenalexId}|${edge.targetOpenalexId}|${edge.type}|${Math.round(edge.weight * 1000)}`
    );

    for (const edge of validEdges) {
      await Db.upsertEdge(env.ALEXCLAW_DB, {
        runId,
        srcPaperId: paperIdByOpenAlexId.get(edge.sourceOpenalexId)!,
        dstPaperId: paperIdByOpenAlexId.get(edge.targetOpenalexId)!,
        edgeType: edge.type,
        weight: edge.weight,
        evidence: { providerEvidence: edge.evidence }
      });
    }

    const seedOpenAlexIds = new Set(canonicalSeeds.map((paper) => paper.openalexId));
    const scoredSummary: Array<{ openalexId: string; totalScore: number; tier: string }> = [];

    for (const paper of allPapers) {
      const scored = scorePaper({
        thesisText: thesis.text,
        title: paper.title,
        abstract: paper.abstract,
        citationCount: paper.citationCount,
        paperId: paper.openalexId,
        seedIds: seedOpenAlexIds,
        edges: validEdges
      });

      await Db.upsertRunPaper(env.ALEXCLAW_DB, {
        runId,
        paperId: paperIdByOpenAlexId.get(paper.openalexId)!,
        lexicalScore: scored.lexicalScore,
        graphScore: scored.graphScore,
        citationScore: scored.citationScore,
        totalScore: scored.totalScore,
        tier: scored.tier
      });

      scoredSummary.push({
        openalexId: paper.openalexId,
        totalScore: scored.totalScore,
        tier: scored.tier
      });
    }

    await runStep(env, runId, "unpaywall_enrichment", async () => {
      const enriched: Array<{ openalexId: string; doi: string; pdfUrl?: string }> = [];

      for (const paper of allPapers) {
        if (!paper.doi) {
          continue;
        }

        const access = await withRetries(
          () => providers.unpaywall.lookupByDoi(paper.doi!),
          2,
          (attempt, error) => console.warn("unpaywall lookup retry", { runId, attempt, error })
        );

        if (!access) {
          continue;
        }

        await Db.upsertPaperAccess(env.ALEXCLAW_DB, {
          paperId: paperIdByOpenAlexId.get(paper.openalexId)!,
          pdfUrl: access.pdfUrl,
          oaStatus: access.oaStatus,
          license: access.license
        });

        enriched.push({
          openalexId: paper.openalexId,
          doi: paper.doi,
          pdfUrl: access.pdfUrl
        });
      }

      return {
        enrichedCount: enriched.length,
        enriched
      };
    });

    await Db.insertEvidence(env.ALEXCLAW_DB, {
      runId,
      entityType: "run",
      entityId: runId,
      source: "pipeline.summary",
      detail: {
        paperCount: allPapers.length,
        edgeCount: validEdges.length,
        seedCount: canonicalSeeds.length,
        scored: scoredSummary
      }
    });

    await Db.updateRunStatus(env.ALEXCLAW_DB, runId, "COMPLETED");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await Db.updateRunStatus(env.ALEXCLAW_DB, runId, "FAILED", message);
    console.error("run failed", { runId, error: message });
  }
}

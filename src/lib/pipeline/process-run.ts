import { Db } from "../db.js";
import { HubDb } from "../hub-db.js";
import { scorePaper } from "../scoring.js";
import { seedSelectionSchema } from "../zod-schemas.js";
import type {
  CanonicalPaper,
  Env,
  PaperCitation,
  SeedSelectionAttemptHistory,
  SeedSelectionQueryHistoryEntry,
  UnpaywallEnrichmentMessage
} from "../types.js";
import { buildProviders } from "../../providers/index.js";
import {
  acquireGlobalRateLimitSlot,
  chunkArray,
  dedupeBy,
  MIN_QUERY_TERMS,
  MIN_REQUIRED_SEEDS,
  normalizeQueryTerms,
  runStep,
  SEMANTIC_SCHOLAR_MIN_INTERVAL_MS,
  SEMANTIC_SCHOLAR_RATE_LIMIT_KEY,
  SELECTION_WINDOW,
  withRetries
} from "./helpers.js";

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
  return dedupeBy(
    links,
    (link) => `${link.sourceOpenalexId}|${link.targetOpenalexId}`
  );
};

export async function processRun(env: Env, runId: string): Promise<void> {
  const providers = buildProviders(env);
  const run = await Db.getRunById(env.ALEXCLAW_DB, runId);
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  const claimed = await Db.markRunRunningIfQueued(env.ALEXCLAW_DB, runId);
  if (!claimed) {
    return;
  }

  const thesis = await Db.getThesisOwned(env.ALEXCLAW_DB, run.thesis_id, run.user_id);
  if (!thesis) {
    await Db.updateRunStatus(env.ALEXCLAW_DB, runId, "FAILED", "Thesis not found for run owner");
    return;
  }

  await Db.clearRunData(env.ALEXCLAW_DB, runId);

  try {
    const thesisSummary = await runStep(env, runId, "llm_thesis_summary", () =>
      withRetries(
        () => providers.reasoning.summarizeThesis(thesis.text),
        3,
        (attempt, error) => console.warn("llm_thesis_summary retry", { runId, attempt, error })
      )
    );

    const extractedThesisTitle = thesisSummary.thesis_title.trim();
    if (extractedThesisTitle && extractedThesisTitle !== thesis.title) {
      await Db.updateThesisTitleOwned(env.ALEXCLAW_DB, {
        thesisId: thesis.id,
        userId: run.user_id,
        title: extractedThesisTitle
      });
    }

    await Db.insertEvidence(env.ALEXCLAW_DB, {
      runId,
      entityType: "run",
      entityId: runId,
      source: "openai.thesis_summary",
      detail: thesisSummary
    });
    await HubDb.upsertProjectMemoryDoc(env.ALEXCLAW_DB, {
      projectId: run.thesis_id,
      key: "thesis_summary",
      title: "Thesis summary",
      content: thesisSummary.thesis_summary,
      source: "system"
    });

    const queryGeneration = await runStep(env, runId, "llm_query_generation", () =>
      withRetries(
        () =>
          providers.reasoning.generateQuery({
            thesisTitle: thesisSummary.thesis_title,
            thesisSummary: thesisSummary.thesis_summary
          }),
        3,
        (attempt, error) => console.warn("llm_query_generation retry", { runId, attempt, error })
      )
    );

    await Db.insertEvidence(env.ALEXCLAW_DB, {
      runId,
      entityType: "run",
      entityId: runId,
      source: "openai.query_generation",
      detail: queryGeneration
    });

    let activeQueryTerms = normalizeQueryTerms(queryGeneration.terms);
    let activeQuery = activeQueryTerms.join(" ");
    let activeQuerySource: SeedSelectionQueryHistoryEntry["source"] = "query_generation";
    let selectedSeedCandidates: Awaited<ReturnType<typeof providers.semanticScholar.search>> = [];
    let seedSelection: Awaited<ReturnType<typeof providers.reasoning.selectSeeds>> | null = null;
    const queryHistory: SeedSelectionQueryHistoryEntry[] = [];
    const selectionHistory: SeedSelectionAttemptHistory[] = [];
    const maxSelectionAttempts = Math.max(1, activeQueryTerms.length - MIN_QUERY_TERMS + 1);

    for (let attempt = 1; attempt <= maxSelectionAttempts; attempt += 1) {
      activeQuery = activeQueryTerms.join(" ");
      const searchResults = await runStep(env, runId, `semantic_search_attempt_${attempt}`, () =>
        withRetries(
          async () => {
            await acquireGlobalRateLimitSlot(
              env,
              SEMANTIC_SCHOLAR_RATE_LIMIT_KEY,
              SEMANTIC_SCHOLAR_MIN_INTERVAL_MS
            );
            return providers.semanticScholar.search(
              activeQuery,
              queryGeneration.fields_of_study,
              SELECTION_WINDOW
            );
          },
          3,
          (retryAttempt, error) =>
            console.warn("semantic_search retry", { runId, attempt, retryAttempt, error })
        )
      );
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

      await Db.insertEvidence(env.ALEXCLAW_DB, {
        runId,
        entityType: "run",
        entityId: runId,
        source: "semantic_scholar.search",
        detail: {
          attempt,
          query: activeQuery,
          totalResults: searchResults.length,
          selectionCandidates: rankedCandidates.length
        }
      });

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

      const attemptSelection = await runStep(env, runId, `llm_select_seeds_attempt_${attempt}`, () =>
        withRetries(
          () =>
            providers.reasoning.selectSeeds({
              thesisTitle: thesisSummary.thesis_title,
              thesisSummary: thesisSummary.thesis_summary,
              candidates: rankedCandidates
            }),
          3,
          (retryAttempt, error) =>
            console.warn("llm_select_seeds retry", { runId, attempt, retryAttempt, error })
        )
      );

      let selectedCandidateIndices: number[] = [];
      seedSelection = attemptSelection;
      if (attemptSelection.outcome === "selected") {
        const candidateById = new Map(rankedCandidates.map((candidate) => [candidate.paperId, candidate]));
        const candidateIndexById = new Map(
          rankedCandidates.map((candidate, candidateIndex) => [candidate.paperId, candidateIndex])
        );
        selectedSeedCandidates = dedupeBy(
          attemptSelection.paper_ids
            .map((paperId) => candidateById.get(paperId))
            .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)),
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

    if (!seedSelection) {
      throw new Error("llm_select_seeds did not return a selection payload");
    }

    await Db.insertEvidence(env.ALEXCLAW_DB, {
      runId,
      entityType: "run",
      entityId: runId,
      source: "openai.seed_selection",
      detail: {
        ...seedSelection,
        selectedCount: selectedSeedCandidates.length,
        finalQuery: activeQuery,
        queryHistory,
        history: selectionHistory
      }
    });

    if (seedSelection.outcome !== "selected" || selectedSeedCandidates.length < MIN_REQUIRED_SEEDS) {
      throw new Error(
        `llm_select_seeds did not produce at least ${MIN_REQUIRED_SEEDS} seeds after ${maxSelectionAttempts} attempts`
      );
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
      [...expanded.papers, ...canonicalSeeds].filter((paper) => paper.openalexId.length > 0),
      (paper) => paper.openalexId
    );
    if (allPapers.length === 0) {
      throw new Error("graph expansion resulted in 0 papers");
    }
    const citationLinks = buildInternalCitationLinks(allPapers);

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
      await Db.replacePaperCitations(env.ALEXCLAW_DB, {
        paperId: persistedPaper.id,
        citedOpenalexIds: paper.referencedOpenalexIds
      });

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

    const seedOpenAlexIds = new Set(canonicalSeeds.map((paper) => paper.openalexId));
    const scoredSummary: Array<{
      openalexId: string;
      title: string;
      totalScore: number;
      tier: string;
    }> = [];

    for (const paper of allPapers) {
      const scored = scorePaper({
        thesisText: thesis.text,
        title: paper.title,
        abstract: paper.abstract,
        citationCount: paper.citationCount,
        paperId: paper.openalexId,
        seedIds: seedOpenAlexIds,
        citations: citationLinks
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
      await HubDb.upsertProjectPaperFromPipeline(env.ALEXCLAW_DB, {
        projectId: run.thesis_id,
        paperId: paperIdByOpenAlexId.get(paper.openalexId)!,
        openalexId: paper.openalexId,
        semanticScholarId: paper.semanticScholarId,
        doi: paper.doi,
        title: paper.title,
        abstract: paper.abstract,
        year: paper.year,
        citationCount: paper.citationCount,
        fieldsOfStudy: paper.fieldsOfStudy,
        lexicalScore: scored.lexicalScore,
        graphScore: scored.graphScore,
        citationScore: scored.citationScore,
        totalScore: scored.totalScore,
        tier: scored.tier
      });

      scoredSummary.push({
        openalexId: paper.openalexId,
        title: paper.title,
        totalScore: scored.totalScore,
        tier: scored.tier
      });
    }

    const unpaywallEnqueueResult = await runStep(env, runId, "enqueue_unpaywall_enrichment", async () => {
      const enrichmentMessages: UnpaywallEnrichmentMessage[] = allPapers
        .filter((paper) => Boolean(paper.doi))
        .map((paper) => ({
          runId,
          paperId: paperIdByOpenAlexId.get(paper.openalexId)!,
          openalexId: paper.openalexId,
          doi: paper.doi!
        }));

      if (enrichmentMessages.length === 0) {
        return { enqueuedCount: 0 };
      }

      for (const chunk of chunkArray(enrichmentMessages, 100)) {
        await env.ALEXCLAW_ENRICH_QUEUE.sendBatch(
          chunk.map((body) => ({ body }))
        );
      }

      return {
        enqueuedCount: enrichmentMessages.length
      };
    });

    await Db.insertEvidence(env.ALEXCLAW_DB, {
      runId,
      entityType: "run",
      entityId: runId,
      source: "pipeline.summary",
      detail: {
        paperCount: allPapers.length,
        citationCount: citationLinks.length,
        seedCount: canonicalSeeds.length,
        enrichmentEnqueuedCount: unpaywallEnqueueResult.enqueuedCount,
        scored: scoredSummary
      }
    });
    const topFindings = [...scoredSummary]
      .sort((left, right) => right.totalScore - left.totalScore)
      .slice(0, 10)
      .map((paper, index) => `${index + 1}. ${paper.title} (${paper.tier.toLowerCase()})`);
    await HubDb.upsertProjectMemoryDoc(env.ALEXCLAW_DB, {
      projectId: run.thesis_id,
      key: "latest_findings",
      title: "Latest findings",
      content:
        topFindings.length > 0
          ? `Top papers from the latest background run:\n${topFindings.join("\n")}`
          : "No papers were selected in the latest run.",
      source: "system"
    });

    await Db.updateRunStatus(env.ALEXCLAW_DB, runId, "COMPLETED");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await Db.updateRunStatus(env.ALEXCLAW_DB, runId, "FAILED", message);
    console.error("run failed", { runId, error: message });
  }
}

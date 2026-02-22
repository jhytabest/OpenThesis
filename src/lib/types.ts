import type { z } from "zod";
import {
  thesisSummarySchema,
  queryGenerationSchema,
  seedSelectionSchema
} from "./zod-schemas.js";

export type RunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type RelevanceTier = "FOUNDATIONAL" | "DEPTH" | "BACKGROUND";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface CandidatePaper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  citationCount?: number;
  doi?: string;
  fieldsOfStudy: string[];
  authors: Array<{ id?: string; name: string }>;
}

export interface CanonicalPaper {
  openalexId: string;
  semanticScholarId?: string;
  doi?: string;
  title: string;
  abstract?: string;
  year?: number;
  citationCount?: number;
  fieldsOfStudy: string[];
  authors: Array<{ openalexId?: string; name: string; orcid?: string }>;
  referencedOpenalexIds: string[];
}

export interface PaperCitation {
  sourceOpenalexId: string;
  targetOpenalexId: string;
}

export interface ScoredPaper {
  lexicalScore: number;
  graphScore: number;
  citationScore: number;
  totalScore: number;
  tier: RelevanceTier;
}

export interface Env {
  ALEXCLAW_DB: D1Database;
  ALEXCLAW_RUN_QUEUE: Queue;
  ALEXCLAW_ENRICH_QUEUE: Queue<UnpaywallEnrichmentMessage>;
  ALEXCLAW_RUN_WORKFLOW: {
    create(input: { id?: string; params: { runId: string } }): Promise<{ id: string }>;
  };
  OPENAI_API_KEY?: string;
  OPENAI_PROMPT_ID_THESIS_SUMMARY?: string;
  OPENAI_PROMPT_VERSION_THESIS_SUMMARY?: string;
  OPENAI_PROMPT_ID_QUERY_GENERATION?: string;
  OPENAI_PROMPT_VERSION_QUERY_GENERATION?: string;
  OPENAI_PROMPT_ID_SEED_SELECTION?: string;
  OPENAI_PROMPT_VERSION_SEED_SELECTION?: string;
  SEMANTIC_SCHOLAR_API_KEY?: string;
  OPENALEX_API_KEY?: string;
  UNPAYWALL_EMAIL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  INTERNAL_API_TOKEN?: string;
  CHAT_BACKEND_URL?: string;
  CHAT_BACKEND_BEARER_TOKEN?: string;
}

export type ThesisSummary = z.infer<typeof thesisSummarySchema>;
export type QueryGeneration = z.infer<typeof queryGenerationSchema>;
export type SeedSelection = z.infer<typeof seedSelectionSchema>;

export interface SeedSelectionSearchSnapshot {
  query: string;
  fields_of_study: string[];
  total_hits: number;
}

export interface SeedSelectionQueryHistoryEntry {
  query_index: number;
  source: "query_generation" | "drop_first" | "drop_last";
  search: SeedSelectionSearchSnapshot;
}

export interface SeedSelectionDecisionSnapshot {
  outcome: "selected" | "empty";
  selected_candidate_indices: number[];
  revised_query: string | null;
}

export interface SeedSelectionAttemptHistory {
  attempt: number;
  query_index: number;
  decision: SeedSelectionDecisionSnapshot;
}

export interface UnpaywallEnrichmentMessage {
  runId: string;
  paperId: string;
  openalexId: string;
  doi: string;
}

export interface SelectSeedsInput {
  thesisTitle: string;
  thesisSummary: string;
  candidates: CandidatePaper[];
}

export interface GenerateQueryInput {
  thesisTitle: string;
  thesisSummary: string;
}

export interface ReasoningProvider {
  summarizeThesis(thesisText: string): Promise<ThesisSummary>;
  generateQuery(input: GenerateQueryInput): Promise<QueryGeneration>;
  selectSeeds(input: SelectSeedsInput): Promise<SeedSelection>;
}

export interface SemanticScholarProvider {
  search(query: string, fieldsOfStudy: string[], limit: number): Promise<CandidatePaper[]>;
}

export interface OpenAlexProvider {
  search(query: string, fieldsOfStudy: string[], limit: number): Promise<CandidatePaper[]>;
  resolveSeeds(seeds: CandidatePaper[]): Promise<CanonicalPaper[]>;
  expandGraph(seedWorks: CanonicalPaper[]): Promise<{
    papers: CanonicalPaper[];
  }>;
}

export interface UnpaywallProvider {
  lookupByDoi(doi: string): Promise<{
    pdfUrl?: string;
    oaStatus?: string;
    license?: string;
  } | null>;
}

export interface Providers {
  reasoning: ReasoningProvider;
  semanticScholar: SemanticScholarProvider;
  openAlex: OpenAlexProvider;
  unpaywall: UnpaywallProvider;
}

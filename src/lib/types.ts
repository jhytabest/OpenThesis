import type { z } from "zod";
import {
  queryPlanSchema,
  seedSelectionSchema
} from "./zod-schemas.js";

export type RunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type RelevanceTier = "FOUNDATIONAL" | "DEPTH" | "BACKGROUND";

export type EdgeType = "REFERENCE" | "CITATION" | "SHARED_AUTHOR";

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
}

export interface GraphEdge {
  sourceOpenalexId: string;
  targetOpenalexId: string;
  type: EdgeType;
  weight: number;
  evidence: string;
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
  ALEXCLAW_RUN_WORKFLOW: {
    create(input: { id?: string; params: { runId: string } }): Promise<{ id: string }>;
  };
  OPENAI_API_KEY?: string;
  OPENAI_PROMPT_ID_QUERY_PLAN?: string;
  OPENAI_PROMPT_VERSION_QUERY_PLAN?: string;
  OPENAI_PROMPT_ID_SEED_SELECTION?: string;
  OPENAI_PROMPT_VERSION_SEED_SELECTION?: string;
  SEMANTIC_SCHOLAR_API_KEY?: string;
  OPENALEX_API_KEY?: string;
  UNPAYWALL_EMAIL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  INTERNAL_API_TOKEN?: string;
}

export type QueryPlan = z.infer<typeof queryPlanSchema>;
export type SeedSelection = z.infer<typeof seedSelectionSchema>;

export interface SeedSelectionTopHitSnapshot {
  candidate_index: number;
  paper_id: string;
  title: string;
  year: number | null;
  citation_count: number | null;
  fields_of_study: string[];
}

export interface SeedSelectionSearchSnapshot {
  query: string;
  fields_of_study: string[];
  total_hits: number;
  top_hits: SeedSelectionTopHitSnapshot[];
}

export interface SeedSelectionQueryHistoryEntry {
  query_index: number;
  source: "query_plan" | "selection_retry";
  search: SeedSelectionSearchSnapshot;
}

export interface SeedSelectionDecisionSnapshot {
  outcome: "selected" | "retry_query";
  selected_candidate_indices: number[];
  revised_query: string | null;
}

export interface SeedSelectionAttemptHistory {
  attempt: number;
  query_index: number;
  decision: SeedSelectionDecisionSnapshot;
}

export interface SelectSeedsInput {
  thesisTitle: string;
  thesisSummary: string;
  candidates: CandidatePaper[];
  queryHistory: SeedSelectionQueryHistoryEntry[];
  previousAttempts: SeedSelectionAttemptHistory[];
}

export interface ReasoningProvider {
  generateQueryPlan(thesisText: string): Promise<QueryPlan>;
  selectSeeds(input: SelectSeedsInput): Promise<SeedSelection>;
}

export interface SemanticScholarProvider {
  search(query: string, fieldsOfStudy: string[], limit: number): Promise<CandidatePaper[]>;
}

export interface OpenAlexProvider {
  resolveSeeds(seeds: CandidatePaper[]): Promise<CanonicalPaper[]>;
  expandGraph(seedWorks: CanonicalPaper[]): Promise<{
    papers: CanonicalPaper[];
    edges: GraphEdge[];
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

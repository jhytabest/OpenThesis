import type { z } from "zod";
import {
  queryPlanSchema,
  seedSelectionSchema,
  triageOutputSchema
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
  OPENAI_MODEL?: string;
  OPENAI_API_KEY?: string;
  SEMANTIC_SCHOLAR_API_KEY?: string;
  OPENALEX_API_KEY?: string;
  UNPAYWALL_EMAIL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export type QueryPlan = z.infer<typeof queryPlanSchema>;
export type TriageOutput = z.infer<typeof triageOutputSchema>;
export type SeedSelection = z.infer<typeof seedSelectionSchema>;

export interface ReasoningProvider {
  generateQueryPlan(thesisText: string): Promise<QueryPlan>;
  triageCandidates(thesisText: string, candidates: CandidatePaper[]): Promise<TriageOutput>;
  selectSeeds(
    thesisText: string,
    candidates: CandidatePaper[],
    triage: TriageOutput
  ): Promise<SeedSelection>;
}

export interface SemanticScholarProvider {
  search(
    query: string,
    fieldsOfStudy: string[],
    limit: number,
    timeHorizon?: { start_year: number | null; end_year: number | null },
    mustTerms?: string[]
  ): Promise<CandidatePaper[]>;
  recommend(
    positivePaperIds: string[],
    negativePaperIds: string[],
    limit: number
  ): Promise<CandidatePaper[]>;
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

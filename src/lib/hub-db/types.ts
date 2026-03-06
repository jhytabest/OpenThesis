import type { ContextStatus, RunStatus, RunType, SourceDocumentKind } from "../types.js";

export interface ProjectListRow {
  id: string;
  title: string | null;
  text: string;
  created_at: string;
  latest_run_id: string | null;
  latest_run_status: RunStatus | null;
  latest_run_type: RunType | null;
  latest_run_context_status: ContextStatus | null;
  latest_run_updated_at: string | null;
  paper_count: number;
  reading_count: number;
  bookmarked_count: number;
  chat_count: number;
}

export interface ProjectPaperRow {
  id: string;
  source: "pipeline" | "manual";
  paper_id: string | null;
  openalex_id: string | null;
  semantic_scholar_id: string | null;
  doi: string | null;
  title: string;
  abstract: string | null;
  year: number | null;
  citation_count: number | null;
  fields_of_study_json: string;
  score_lexical: number | null;
  score_graph: number | null;
  score_citation: number | null;
  score_total: number | null;
  pdf_url: string | null;
  oa_status: string | null;
  license: string | null;
  bookmarked: number;
  in_reading_list: number;
  tags_json: string;
  note_text: string | null;
  is_deleted: number;
  created_at: string;
  updated_at: string;
  comment_count: number;
}

export interface ProjectContext {
  project: {
    id: string;
    title: string | null;
    thesisText: string;
  };
  memoryDocs: Array<{
    key: string;
    title: string;
    content: string;
    source: "auto" | "manual" | "system";
    updatedAt: string;
  }>;
  papers: Array<{
    id: string;
    title: string;
    abstract: string | null;
    year: number | null;
    doi: string | null;
    scoreTotal: number | null;
    bookmarked: boolean;
    inReadingList: boolean;
  }>;
}

export interface SourceDocumentRow {
  id: string;
  project_id: string;
  google_file_id: string;
  kind: SourceDocumentKind;
  role: string | null;
  title: string | null;
  mime_type: string | null;
  include_in_runs: number;
  is_designated_thesis_doc: number;
  active: number;
  created_at: string;
  updated_at: string;
}

export type RunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type RelevanceTier = "FOUNDATIONAL" | "DEPTH" | "BACKGROUND";

export type ViewKey = "new-project" | "dashboard" | "explorer" | "reading" | "chat";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface ProjectSummary {
  id: string;
  title: string | null;
  createdAt: string;
  textPreview: string;
  latestRun: {
    id: string;
    status: RunStatus;
    updatedAt: string;
  } | null;
  counts: {
    papers: number;
    readingList: number;
    bookmarked: number;
    chats: number;
  };
}

export interface ProjectDashboard {
  project: {
    id: string;
    title: string | null;
    thesisText: string;
    createdAt: string;
  };
  summary: {
    thesisSummary: string | null;
    progressLog: string | null;
  };
  stats: {
    papers: number;
    foundational: number;
    depth: number;
    background: number;
    openAccess: number;
    readingList: number;
    bookmarked: number;
    chats: number;
    memoryDocs: number;
  };
  latestRun: {
    id: string;
    status: RunStatus;
    error: string | null;
    updatedAt: string;
  } | null;
}

export interface ProjectMemoryDoc {
  id: string;
  key: string;
  title: string;
  content: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectChat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  lastMessageAt?: string | null;
}

export interface ProjectChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ProjectPaper {
  id: string;
  source: string;
  paperId: string | null;
  openalexId: string | null;
  semanticScholarId: string | null;
  doi: string | null;
  title: string;
  abstract: string | null;
  year: number | null;
  citationCount: number | null;
  fieldsOfStudy: string[];
  score: {
    lexical: number | null;
    graph: number | null;
    citation: number | null;
    total: number | null;
  };
  tier: RelevanceTier | null;
  access: {
    pdfUrl: string | null;
    oaStatus: string | null;
    license: string | null;
  };
  bookmarked: boolean;
  inReadingList: boolean;
  tags: string[];
  comment: string | null;
  note: string | null;
  isDeleted: boolean;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPaperComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExplorerFilters {
  query: string;
  sort: "relevance" | "recent" | "citations" | "newest";
  tier: "" | RelevanceTier;
  oaOnly: boolean;
  bookmarkedOnly: boolean;
}

export interface ManualPaperForm {
  title: string;
  doi: string;
  year: string;
  citationCount: string;
  fields: string;
  abstract: string;
}

export interface ReadingDraft {
  tags: string;
  comment: string;
}

export type RunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
export type RunType = "RESEARCH" | "THESIS_ASSISTANT" | "DATASET_ANALYSIS";
export type ContextStatus = "CURRENT" | "STALE";
export type SourceDocumentKind = "GOOGLE_DOC" | "GOOGLE_SHEET" | "PDF" | "CSV" | "XLSX";
export type ByokProvider = "openai" | "openrouter" | "gemini" | "claude";
export type ResearchKeyProvider = "openalex" | "semantic_scholar";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthMeResponse {
  user: SessionUser;
}

export interface ProjectListItem {
  id: string;
  title: string | null;
  createdAt: string;
  textPreview: string;
  latestRun: {
    id: string;
    status: RunStatus | null;
    runType: RunType | null;
    contextStatus: ContextStatus | null;
    updatedAt: string | null;
  } | null;
  counts: {
    papers: number;
    readingList: number;
    bookmarked: number;
    chats: number;
  };
}

export interface ListProjectsResponse {
  projects: ProjectListItem[];
}

export interface ProjectDetail {
  id: string;
  title: string | null;
  thesisText: string;
  createdAt: string;
  latestRun: {
    id: string;
    status: RunStatus;
    runType: RunType;
    contextStatus: ContextStatus;
    inputSnapshotHash: string | null;
    error: string | null;
    updatedAt: string;
  } | null;
}

export interface ProjectDetailResponse {
  project: ProjectDetail;
}

export interface CreateProjectRequest {
  title?: string;
  thesisText: string;
}

export interface CreateProjectResponse {
  project: {
    id: string;
    title: string | null;
    thesisText: string;
    createdAt: string;
  };
  run: {
    id: string;
    status: RunStatus;
    runType: RunType;
    contextStatus: ContextStatus;
    inputSnapshotHash: string | null;
    createdAt: string;
  };
}

export interface UpdateProjectRequest {
  title?: string;
  thesisText?: string;
}

export interface UpdateProjectResponse {
  project: {
    id: string;
    title: string | null;
    thesisText: string;
    createdAt: string;
  };
}

export interface CreateRunRequest {
  runType?: RunType;
  snapshotPolicy?: "LATEST_FROZEN";
}

export interface CreateRunResponse {
  run: {
    id: string;
    status: RunStatus;
    runType: RunType;
    contextStatus: ContextStatus;
    inputSnapshotHash: string | null;
    createdAt: string;
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
    openAccess: number;
    readingList: number;
    bookmarked: number;
    chats: number;
    memoryDocs: number;
  };
  latestRun: {
    id: string;
    status: RunStatus;
    runType: RunType;
    contextStatus: ContextStatus;
    inputSnapshotHash: string | null;
    error: string | null;
    updatedAt: string;
  } | null;
}

export interface ProjectDashboardResponse {
  dashboard: ProjectDashboard;
}

export interface ByokSettings {
  activeProvider: ByokProvider | null;
  activeModel: string | null;
  providers: Record<ByokProvider, {
    configured: boolean;
    keyHint: string | null;
    model: string | null;
    updatedAt: string | null;
  }>;
}

export interface GetByokResponse {
  byok: ByokSettings;
}

export interface SetByokRequest {
  provider: ByokProvider;
  apiKey?: string;
  model?: string | null;
  setActive?: boolean;
}

export interface ClearByokRequest {
  provider?: ByokProvider;
}

export interface ResearchKeySettings {
  providers: Record<ResearchKeyProvider, {
    configured: boolean;
    keyHint: string | null;
    updatedAt: string | null;
  }>;
}

export interface GetResearchKeysResponse {
  researchKeys: ResearchKeySettings;
}

export interface SetResearchKeyRequest {
  provider: ResearchKeyProvider;
  apiKey: string;
}

export interface ClearResearchKeyRequest {
  provider?: ResearchKeyProvider;
}

export interface GoogleIntegrationStatusResponse {
  integration: {
    connected: boolean;
    accountEmail: string | null;
    scopes: string[];
    updatedAt: string | null;
  };
  root: {
    rootFolderId: string;
    pullFolderId: string;
    pushFolderId: string;
    updatedAt: string;
  } | null;
}

export interface SetGoogleRootRequest {
  rootFolderId: string;
  pullFolderId: string;
  pushFolderId: string;
}

export interface ProjectSourceDocument {
  id: string;
  googleFileId: string;
  kind: SourceDocumentKind;
  role: string | null;
  title: string | null;
  mimeType: string | null;
  includeInRuns: boolean;
  isDesignatedThesisDoc: boolean;
  active: boolean;
  latestSnapshotId: string | null;
  latestSnapshotCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListSourceDocumentsResponse {
  documents: ProjectSourceDocument[];
}

export interface PatchSourceDocumentRequest {
  role?: string | null;
  includeInRuns?: boolean;
  isDesignatedThesisDoc?: boolean;
  active?: boolean;
}

export interface DocumentSnapshot {
  id: string;
  revisionRef: string;
  checksum: string;
  sizeBytes: number;
  storageKey: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListDocumentSnapshotsResponse {
  snapshots: DocumentSnapshot[];
}

export interface TriggerSyncResponse {
  sync: {
    syncEventId: string;
    imported: number;
    updatedSnapshots: number;
    staleRunsMarked: boolean;
  };
}

export interface ProjectRunListItem {
  id: string;
  status: RunStatus;
  runType: RunType;
  contextStatus: ContextStatus;
  inputSnapshotHash: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListProjectRunsResponse {
  runs: ProjectRunListItem[];
}

export interface ProjectRunDetailResponse {
  run: ProjectRunListItem;
  inputs: Array<{
    snapshotId: string;
    sourceDocumentId: string;
    documentTitle: string | null;
    kind: SourceDocumentKind;
    revisionRef: string;
    checksum: string;
    createdAt: string;
  }>;
  steps: Array<{
    id: string;
    name: string;
    status: string;
    attempt: number;
    startedAt: string;
    finishedAt: string | null;
    error: string | null;
  }>;
  comments: Array<{
    id: string;
    sourceDocumentId: string;
    sectionLabel: string;
    googleCommentId: string | null;
    status: "POSTED" | "FAILED";
    error: string | null;
    createdAt: string;
  }>;
}

export interface RunAuditEventsResponse {
  events: Array<{
    id: string;
    eventType: string;
    detail: Record<string, unknown>;
    createdAt: string;
  }>;
}

export interface RunArtifactsResponse {
  artifacts: Array<{
    id: string;
    runId: string;
    artifactType: string;
    title: string;
    storageKey: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export interface ProjectPaper {
  id: string;
  source: "pipeline" | "manual";
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

export interface ListProjectPapersResponse {
  papers: ProjectPaper[];
}

export interface CreateProjectPaperRequest {
  title: string;
  abstract?: string;
  year?: number;
  doi?: string;
  citationCount?: number;
  fieldsOfStudy?: string[];
  bookmarked?: boolean;
  inReadingList?: boolean;
  note?: string;
  tags?: string[];
}

export interface CreateProjectPaperResponse {
  paper: ProjectPaper;
}

export interface UpdateProjectPaperRequest {
  title?: string;
  abstract?: string | null;
  year?: number | null;
  doi?: string | null;
  citationCount?: number | null;
  fieldsOfStudy?: string[];
  bookmarked?: boolean;
  inReadingList?: boolean;
  note?: string | null;
  tags?: string[];
  isDeleted?: boolean;
}

export interface UpdateProjectPaperResponse {
  paper: ProjectPaper;
}

export interface ProjectPaperComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListProjectPaperCommentsResponse {
  comments: ProjectPaperComment[];
}

export interface CreateProjectPaperCommentResponse {
  comment: ProjectPaperComment;
}

export interface ProjectChat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessageAt: string | null;
}

export interface ListProjectChatsResponse {
  chats: ProjectChat[];
}

export interface CreateProjectChatResponse {
  chat: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListChatMessagesResponse {
  messages: ChatMessage[];
}

export interface CreateChatMessageResponse {
  messages: ChatMessage[];
}

export interface ProjectMemoryDoc {
  id: string;
  key: string;
  title: string;
  content: string;
  source: "auto" | "manual" | "system";
  createdAt: string;
  updatedAt: string;
}

export interface ListProjectMemoryDocsResponse {
  memoryDocs: ProjectMemoryDoc[];
}

export interface ApiOkResponse {
  ok: true;
}

export interface ApiErrorPayload {
  error: string;
  retryAfterMs?: number;
}

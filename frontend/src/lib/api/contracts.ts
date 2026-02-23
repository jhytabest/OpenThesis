export type RunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

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

export interface CreateRunResponse {
  run: {
    id: string;
    status: RunStatus;
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
    error: string | null;
    updatedAt: string;
  } | null;
}

export interface ProjectDashboardResponse {
  dashboard: ProjectDashboard;
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

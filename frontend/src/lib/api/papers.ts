import { apiFetch, withQuery } from "@/lib/api/client";
import type {
  ApiOkResponse,
  CreateProjectPaperCommentResponse,
  CreateProjectPaperRequest,
  CreateProjectPaperResponse,
  ListProjectPaperCommentsResponse,
  ListProjectPapersResponse,
  RelevanceTier,
  UpdateProjectPaperRequest,
  UpdateProjectPaperResponse,
} from "@/lib/api/contracts";

export interface ListPapersParams {
  query?: string;
  sort?: "relevance" | "recent" | "citations" | "newest";
  tier?: RelevanceTier;
  oaOnly?: boolean;
  bookmarkedOnly?: boolean;
  readingOnly?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export const papersApi = {
  list(projectId: string, params?: ListPapersParams): Promise<ListProjectPapersResponse> {
    const path = withQuery(`/api/projects/${projectId}/papers`, {
      query: params?.query,
      sort: params?.sort,
      tier: params?.tier,
      oaOnly: params?.oaOnly,
      bookmarkedOnly: params?.bookmarkedOnly,
      readingOnly: params?.readingOnly,
      includeDeleted: params?.includeDeleted,
      limit: params?.limit,
      offset: params?.offset,
    });
    return apiFetch<ListProjectPapersResponse>(path);
  },

  create(projectId: string, input: CreateProjectPaperRequest): Promise<CreateProjectPaperResponse> {
    return apiFetch<CreateProjectPaperResponse>(`/api/projects/${projectId}/papers`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  update(projectId: string, paperId: string, input: UpdateProjectPaperRequest): Promise<UpdateProjectPaperResponse> {
    return apiFetch<UpdateProjectPaperResponse>(`/api/projects/${projectId}/papers/${paperId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  delete(projectId: string, paperId: string): Promise<ApiOkResponse> {
    return apiFetch<ApiOkResponse>(`/api/projects/${projectId}/papers/${paperId}`, {
      method: "DELETE",
    });
  },

  readingList(projectId: string): Promise<ListProjectPapersResponse> {
    return apiFetch<ListProjectPapersResponse>(`/api/projects/${projectId}/reading-list`);
  },

  comments(projectId: string, paperId: string): Promise<ListProjectPaperCommentsResponse> {
    return apiFetch<ListProjectPaperCommentsResponse>(`/api/projects/${projectId}/papers/${paperId}/comments`);
  },

  createComment(projectId: string, paperId: string, body: string): Promise<CreateProjectPaperCommentResponse> {
    return apiFetch<CreateProjectPaperCommentResponse>(`/api/projects/${projectId}/papers/${paperId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  },

  deleteComment(projectId: string, paperId: string, commentId: string): Promise<ApiOkResponse> {
    return apiFetch<ApiOkResponse>(`/api/projects/${projectId}/papers/${paperId}/comments/${commentId}`, {
      method: "DELETE",
    });
  },
};

import { apiFetch } from "@/lib/api/client";
import type {
  ApiOkResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateRunResponse,
  ListProjectsResponse,
  ProjectDashboardResponse,
  ProjectDetailResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
} from "@/lib/api/contracts";

export const projectsApi = {
  list(): Promise<ListProjectsResponse> {
    return apiFetch<ListProjectsResponse>("/api/projects");
  },

  get(projectId: string): Promise<ProjectDetailResponse> {
    return apiFetch<ProjectDetailResponse>(`/api/projects/${projectId}`);
  },

  create(input: CreateProjectRequest): Promise<CreateProjectResponse> {
    return apiFetch<CreateProjectResponse>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  update(projectId: string, input: UpdateProjectRequest): Promise<UpdateProjectResponse> {
    return apiFetch<UpdateProjectResponse>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  delete(projectId: string): Promise<ApiOkResponse> {
    return apiFetch<ApiOkResponse>(`/api/projects/${projectId}`, {
      method: "DELETE",
    });
  },

  createRun(projectId: string): Promise<CreateRunResponse> {
    return apiFetch<CreateRunResponse>(`/api/projects/${projectId}/runs`, {
      method: "POST",
    });
  },

  dashboard(projectId: string): Promise<ProjectDashboardResponse> {
    return apiFetch<ProjectDashboardResponse>(`/api/projects/${projectId}/dashboard`);
  },
};

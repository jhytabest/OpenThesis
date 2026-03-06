import { apiFetch } from "@/lib/api/client";
import type {
  ApiOkResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateRunRequest,
  CreateRunResponse,
  ListDocumentSnapshotsResponse,
  ListProjectRunsResponse,
  ListProjectsResponse,
  ListSourceDocumentsResponse,
  PatchSourceDocumentRequest,
  ProjectDashboardResponse,
  ProjectDetailResponse,
  ProjectRunDetailResponse,
  RunArtifactsResponse,
  RunAuditEventsResponse,
  TriggerSyncResponse,
  GoogleIntegrationStatusResponse,
  SetGoogleRootRequest,
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

  createRun(projectId: string, input: CreateRunRequest = {}): Promise<CreateRunResponse> {
    return apiFetch<CreateRunResponse>(`/api/projects/${projectId}/runs`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listRuns(projectId: string): Promise<ListProjectRunsResponse> {
    return apiFetch<ListProjectRunsResponse>(`/api/projects/${projectId}/runs`);
  },

  getRun(projectId: string, runId: string): Promise<ProjectRunDetailResponse> {
    return apiFetch<ProjectRunDetailResponse>(`/api/projects/${projectId}/runs/${runId}`);
  },

  getRunAudit(projectId: string, runId: string): Promise<RunAuditEventsResponse> {
    return apiFetch<RunAuditEventsResponse>(`/api/projects/${projectId}/runs/${runId}/audit`);
  },

  getRunArtifacts(projectId: string, runId: string): Promise<RunArtifactsResponse> {
    return apiFetch<RunArtifactsResponse>(`/api/projects/${projectId}/runs/${runId}/artifacts`);
  },

  dashboard(projectId: string): Promise<ProjectDashboardResponse> {
    return apiFetch<ProjectDashboardResponse>(`/api/projects/${projectId}/dashboard`);
  },

  getGoogleIntegration(projectId: string): Promise<GoogleIntegrationStatusResponse> {
    return apiFetch<GoogleIntegrationStatusResponse>(`/api/projects/${projectId}/integrations/google`);
  },

  getGoogleConnectUrl(projectId: string): string {
    return `/api/projects/${projectId}/integrations/google/connect`;
  },

  setGoogleRoot(projectId: string, input: SetGoogleRootRequest): Promise<ApiOkResponse> {
    return apiFetch<ApiOkResponse>(`/api/projects/${projectId}/integrations/google/root`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  sync(projectId: string): Promise<TriggerSyncResponse> {
    return apiFetch<TriggerSyncResponse>(`/api/projects/${projectId}/sync`, {
      method: "POST",
    });
  },

  listDocuments(projectId: string): Promise<ListSourceDocumentsResponse> {
    return apiFetch<ListSourceDocumentsResponse>(`/api/projects/${projectId}/documents`);
  },

  patchDocument(
    projectId: string,
    documentId: string,
    patch: PatchSourceDocumentRequest
  ): Promise<ApiOkResponse> {
    return apiFetch<ApiOkResponse>(`/api/projects/${projectId}/documents/${documentId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  listDocumentSnapshots(projectId: string, documentId: string): Promise<ListDocumentSnapshotsResponse> {
    return apiFetch<ListDocumentSnapshotsResponse>(
      `/api/projects/${projectId}/documents/${documentId}/snapshots`
    );
  },
};

import { apiFetch } from "@/lib/api/client";
import type { ApiOkResponse, ListProjectMemoryDocsResponse } from "@/lib/api/contracts";

export const memoryApi = {
  list(projectId: string): Promise<ListProjectMemoryDocsResponse> {
    return apiFetch<ListProjectMemoryDocsResponse>(`/api/projects/${projectId}/memory-docs`);
  },

  update(projectId: string, docKey: string, input: { title?: string; content: string }): Promise<ApiOkResponse> {
    const encodedDocKey = encodeURIComponent(docKey);
    return apiFetch<ApiOkResponse>(`/api/projects/${projectId}/memory-docs/${encodedDocKey}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
};

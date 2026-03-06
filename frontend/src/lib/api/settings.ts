import { apiFetch } from "@/lib/api/client";
import type {
  ApiOkResponse,
  ClearByokRequest,
  GetByokResponse,
  SetByokRequest
} from "@/lib/api/contracts";

export const settingsApi = {
  getByok(): Promise<GetByokResponse> {
    return apiFetch<GetByokResponse>("/api/settings/byok");
  },

  setByok(input: SetByokRequest): Promise<ApiOkResponse> {
    return apiFetch<ApiOkResponse>("/api/settings/byok", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  clearByok(input?: ClearByokRequest): Promise<ApiOkResponse> {
    return apiFetch<ApiOkResponse>("/api/settings/byok", {
      method: "DELETE",
      body: input ? JSON.stringify(input) : undefined
    });
  },
};

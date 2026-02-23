import { apiFetch } from "@/lib/api/client";
import type { ApiOkResponse, AuthMeResponse } from "@/lib/api/contracts";

export const authApi = {
  me(): Promise<AuthMeResponse> {
    return apiFetch<AuthMeResponse>("/api/auth/me");
  },

  logout(): Promise<ApiOkResponse> {
    return apiFetch<ApiOkResponse>("/api/auth/logout", {
      method: "POST",
    });
  },
};

import type { ApiErrorPayload } from "@/lib/api/contracts";

export class ApiError extends Error {
  status: number;
  payload?: ApiErrorPayload;

  constructor(status: number, message: string, payload?: ApiErrorPayload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

const maybeParseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const withQuery = (path: string, params?: Record<string, string | number | boolean | undefined>): string => {
  if (!params) {
    return path;
  }
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
  });

  const data = await maybeParseJson(response);

  if (!response.ok) {
    const payload = data && typeof data === "object" ? (data as ApiErrorPayload) : undefined;
    const message = payload?.error || response.statusText || "Request failed";
    throw new ApiError(response.status, message, payload);
  }

  return data as T;
}

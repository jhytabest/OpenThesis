import type { Env } from "./types.js";

const resolveGoogleAuthCallbackUrl = (requestUrl: string): string =>
  new URL("/auth/google/callback", requestUrl).toString();

const resolveGoogleIntegrationCallbackUrl = (requestUrl: string, projectId: string): string =>
  new URL(`/api/projects/${projectId}/integrations/google/callback`, requestUrl).toString();

const buildGoogleAuthorizationUrl = (env: Env, input: {
  state: string;
  callbackUrl: string;
  scopes: string[];
}): string => {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", input.callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  return url.toString();
};

const buildGoogleAuthAuthorizationUrl = (env: Env, input: {
  state: string;
  callbackUrl: string;
}): string =>
  buildGoogleAuthorizationUrl(env, {
    ...input,
    scopes: ["openid", "email", "profile"]
  });

const buildGoogleDriveAuthorizationUrl = (env: Env, input: {
  state: string;
  callbackUrl: string;
}): string =>
  buildGoogleAuthorizationUrl(env, {
    ...input,
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/documents.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.file"
    ]
  });

const exchangeGoogleCode = async (env: Env, input: {
  code: string;
  callbackUrl: string;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}> => {
  const body = new URLSearchParams();
  body.set("code", input.code);
  body.set("client_id", env.GOOGLE_CLIENT_ID ?? "");
  body.set("client_secret", env.GOOGLE_CLIENT_SECRET ?? "");
  body.set("redirect_uri", input.callbackUrl);
  body.set("grant_type", "authorization_code");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json();
};

const refreshGoogleAccessToken = async (env: Env, refreshToken: string): Promise<{
  access_token: string;
  expires_in?: number;
}> => {
  const body = new URLSearchParams();
  body.set("client_id", env.GOOGLE_CLIENT_ID ?? "");
  body.set("client_secret", env.GOOGLE_CLIENT_SECRET ?? "");
  body.set("refresh_token", refreshToken);
  body.set("grant_type", "refresh_token");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token refresh failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json();
};

const fetchGoogleProfile = async (accessToken: string): Promise<{
  sub?: string;
  email?: string;
  name?: string;
}> => {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google user profile failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json();
};

export const OAuth = {
  resolveGoogleAuthCallbackUrl,
  resolveGoogleIntegrationCallbackUrl,
  buildGoogleAuthAuthorizationUrl,
  buildGoogleDriveAuthorizationUrl,
  exchangeGoogleCode,
  refreshGoogleAccessToken,
  fetchGoogleProfile,
  isGoogleConfigured(env: Env): boolean {
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  }
};

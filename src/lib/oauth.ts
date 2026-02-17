import type { Env } from "./types.js";

const resolveGoogleCallbackUrl = (env: Env, requestUrl: string): string => {
  const configured = env.GOOGLE_CALLBACK_URL?.trim();
  if (configured) {
    return configured;
  }
  return new URL("/auth/google/callback", requestUrl).toString();
};

const buildGoogleAuthorizationUrl = (env: Env, state: string, callbackUrl: string): string => {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
};

const exchangeGoogleCode = async (
  env: Env,
  code: string,
  callbackUrl: string
): Promise<{ access_token: string }> => {
  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", env.GOOGLE_CLIENT_ID ?? "");
  body.set("client_secret", env.GOOGLE_CLIENT_SECRET ?? "");
  body.set("redirect_uri", callbackUrl);
  body.set("grant_type", "authorization_code");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json<{ access_token: string }>();
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
  resolveGoogleCallbackUrl,
  buildGoogleAuthorizationUrl,
  exchangeGoogleCode,
  fetchGoogleProfile,
  isConfigured(env: Env): boolean {
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  }
};

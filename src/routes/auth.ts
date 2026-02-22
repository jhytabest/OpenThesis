import { Auth } from "../lib/auth.js";
import { Db } from "../lib/db.js";
import { OAuth } from "../lib/oauth.js";
import { json, type App } from "./shared.js";

export function registerAuthRoutes(app: App): void {
  app.get("/auth/google", async (c) => {
    if (!OAuth.isConfigured(c.env)) {
      return json({ error: "Google OAuth is not configured" }, 503);
    }

    const callbackUrl = OAuth.resolveGoogleCallbackUrl(c.req.url);
    const state = Auth.randomToken();
    c.header(
      "Set-Cookie",
      Auth.toSetCookie({
        name: "oauth_state",
        value: state,
        maxAge: 600,
        secure: true
      })
    );

    return c.redirect(OAuth.buildGoogleAuthorizationUrl(c.env, state, callbackUrl));
  });

  app.get("/auth/google/callback", async (c) => {
    try {
      if (!OAuth.isConfigured(c.env)) {
        return json({ error: "Google OAuth is not configured" }, 503);
      }

      const code = c.req.query("code");
      const state = c.req.query("state");
      if (!code || !state) {
        return json({ error: "Missing OAuth callback params" }, 400);
      }

      const cookies = Auth.parseCookies(c.req.header("cookie"));
      const expectedState = cookies.oauth_state;
      if (!expectedState || expectedState !== state) {
        return json({ error: "Invalid OAuth state" }, 400);
      }

      const callbackUrl = OAuth.resolveGoogleCallbackUrl(c.req.url);
      const token = await OAuth.exchangeGoogleCode(c.env, code, callbackUrl);
      const profile = await OAuth.fetchGoogleProfile(token.access_token);

      if (!profile.sub || !profile.email) {
        return json({ error: "Google profile missing required fields" }, 400);
      }
      if (profile.email_verified !== true) {
        return json({ error: "Google account email must be verified" }, 403);
      }

      const user = await Db.createOrUpdateGoogleUser(c.env.ALEXCLAW_DB, {
        googleSub: profile.sub,
        email: profile.email,
        name: profile.name ?? profile.email
      });

      await Auth.createSessionCookie(c, user.id);
      c.header(
        "Set-Cookie",
        Auth.toSetCookie({
          name: "oauth_state",
          value: "",
          maxAge: 0,
          secure: true
        }),
        { append: true }
      );
      return c.redirect("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "EMAIL_ALREADY_IN_USE") {
        return json({ error: "An account with this email already exists under a different identity" }, 409);
      }
      return json({ error: message }, 500);
    }
  });

  app.get("/api/auth/me", async (c) => {
    const user = await Auth.resolveUser(c);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    return json({ user });
  });

  app.post("/api/auth/logout", async (c) => {
    await Auth.deleteSession(c);
    Auth.clearSessionCookie(c);
    return json({ ok: true });
  });
}

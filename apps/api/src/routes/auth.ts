import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createSession, deleteSession } from "../db/sessions";
import { upsertGithubUser } from "../db/users";
import type { AppEnv } from "../env";
import { randomToken } from "../lib/crypto";
import { ApiError, notFound } from "../lib/errors";
import { log } from "../lib/log";
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from "../middleware/auth";

/**
 * Login with GitHub, using the OAuth 2.0 authorization code flow:
 *
 *   1. /github: we redirect the browser to GitHub with a random `state`, which
 *      we also put in a short-lived cookie.
 *   2. The user approves; GitHub redirects back to /github/callback with a
 *      one-time `code` and the same `state`.
 *   3. We check `state` matches the cookie (so an attacker can't splice their
 *      own login into your browser), swap the code for an access token
 *      server-to-server, fetch the profile, and start our own session.
 *
 * We only need the profile once, so the GitHub token is thrown away afterwards.
 */
export const auth = new Hono<AppEnv>();

const STATE_COOKIE = "flooper_oauth_state";

auth.get("/github", (c) => {
  const clientId = c.env.GITHUB_CLIENT_ID;
  if (!clientId) throw new ApiError(500, "internal_error", "GitHub login isn't configured");

  const state = randomToken();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT === "production",
    sameSite: "Lax",
    path: "/api/auth",
    maxAge: 10 * 60,
  });

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl(c));
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return c.redirect(url.toString());
});

auth.get("/github/callback", async (c) => {
  const { code, state } = c.req.query();
  const expectedState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/api/auth" });
  if (!code || !state || !expectedState || state !== expectedState) {
    throw new ApiError(400, "bad_request", "Login expired or was tampered with. Try again.");
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(c),
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!token.access_token) {
    log("warn", "github token exchange failed", { error: token.error });
    throw new ApiError(400, "bad_request", "GitHub login failed. Try again.");
  }

  const profileRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "flooper",
    },
  });
  if (!profileRes.ok) throw new Error(`GitHub /user returned ${profileRes.status}`);
  const profile = (await profileRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };

  const user = await upsertGithubUser(c.env.DB, {
    githubId: profile.id,
    login: profile.login,
    name: profile.name,
    avatarUrl: profile.avatar_url,
  });
  setSessionCookie(c, await createSession(c.env.DB, user.id));
  return c.redirect(c.env.APP_URL);
});

/** Local development only: log in as a fake user without setting up GitHub. */
auth.post("/dev-login", async (c) => {
  if (c.env.ENVIRONMENT !== "development") throw notFound();
  const user = await upsertGithubUser(c.env.DB, {
    githubId: 0,
    login: "dev",
    name: "Dev User",
    avatarUrl: null,
  });
  setSessionCookie(c, await createSession(c.env.DB, user.id));
  return c.body(null, 204);
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await deleteSession(c.env.DB, token);
  clearSessionCookie(c);
  return c.body(null, 204);
});

/** The URL GitHub sends people back to. Must match the OAuth app's settings exactly. */
function callbackUrl(c: Context<AppEnv>): string {
  const base = URL.canParse(c.env.APP_URL) ? c.env.APP_URL : c.req.url;
  return new URL("/api/auth/github/callback", base).toString();
}

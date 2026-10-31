import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { findUserBySessionToken, SESSION_TTL_MS } from "../db/sessions";
import type { AppEnv, AuthedEnv } from "../env";
import { ApiError, unauthorized } from "../lib/errors";

export const SESSION_COOKIE = "flooper_session";

/**
 * The session cookie is:
 * - HttpOnly: page JavaScript can't read it, so an XSS bug can't steal it.
 * - Secure (in production): only ever sent over HTTPS.
 * - SameSite=Lax: not sent on cross-site POSTs, the first line of CSRF defense.
 */
export function setSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Reject the request with 401 unless it carries a valid session. */
export const requireUser = createMiddleware<AuthedEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await findUserBySessionToken(c.env.DB, token) : null;
  if (!user) throw unauthorized();
  c.set("user", user);
  await next();
});

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defense, second line: a state-changing request authenticated by cookie
 * must come from a page on our own origin (or one we explicitly trust, like the
 * Vite dev server). Browsers always send `Origin` on such requests and pages
 * can't forge it.
 */
export const requireTrustedOrigin = createMiddleware<AppEnv>(async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header("Origin");
    const trusted = [
      new URL(c.req.url).origin,
      ...c.env.TRUSTED_ORIGINS.split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ];
    if (!origin || !trusted.includes(origin)) {
      throw new ApiError(403, "forbidden", "Request origin not allowed");
    }
  }
  await next();
});

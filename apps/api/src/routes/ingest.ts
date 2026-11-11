import { LIMITS } from "@flooper/shared";
import { feedbackSubmissionSchema, replyRequestSchema } from "@flooper/shared/schemas";
import { type Context, Hono } from "hono";
import { insertFeedback, setContactEmail } from "../db/feedback";
import { allowedOrigins, getProjectByPublicKey, type ProjectRow } from "../db/projects";
import { hitRateLimit } from "../db/rate-limit";
import type { AppEnv } from "../env";
import { sha256Hex } from "../lib/crypto";
import { ApiError, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { log } from "../lib/log";
import { parseJsonBody } from "../lib/validate";

/**
 * The public endpoint the SDK posts to from visitors' browsers, on *other
 * people's* websites. Everything here assumes hostile input.
 *
 * CORS here is deliberately permissive: every response, errors included, can
 * be read by the calling page, and preflights always pass. The real gate is
 * the origin allowlist, checked on the POST itself. If the preflight refused
 * instead, the browser would hide our error from the SDK, and a site missing
 * from the allowlist would look exactly like a network failure. Being
 * readable is safe: requests carry no cookies, and an error only says why a
 * note was refused.
 */
export const ingest = new Hono<AppEnv>();

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };
const DAY_MS = 24 * 60 * 60 * 1000;

ingest.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin) c.header("Access-Control-Allow-Origin", origin);
  // Cross-origin JS can only read "safelisted" response headers unless we
  // expose others explicitly. The SDK needs Retry-After to back off politely.
  c.header("Access-Control-Expose-Headers", "Retry-After, X-Request-Id");
  // The response depends on Origin, so caches must not share it across origins.
  c.header("Vary", "Origin");
  await next();
});

/**
 * What the widget needs to know about its site before showing the form: for
 * now, whether to ask "Want to hear back about this?". Asked once, when a
 * visitor first opens the widget. Unknown keys get the defaults, so this
 * says nothing about which keys exist.
 */
ingest.get("/:publicKey/config", async (c) => {
  const project = await getProjectByPublicKey(c.env.DB, c.req.param("publicKey"));
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ replies: project?.reply_requests === 1 });
});

// Preflight for the widget's POSTs (a note, and then maybe an address).
ingest.options("/:publicKey/*", (c) => {
  c.header("Access-Control-Allow-Methods", "POST");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  // Let the browser cache this preflight for a day instead of repeating it.
  c.header("Access-Control-Max-Age", "86400");
  return c.body(null, 204);
});

ingest.post("/:publicKey/feedback", async (c) => {
  // The emergency switch, checked before any database work. 503 with a long
  // Retry-After: the SDK doesn't retry waits over 10 seconds, so visitors get
  // one clear message instead of a burst of retries.
  if (c.env.INGEST_PAUSED === "true") {
    throw new ApiError(503, "paused", "Notes are paused for a little while", undefined, {
      "Retry-After": "300",
    });
  }

  const project = await authorizeOrigin(c);
  const submission = await parseJsonBody(c, feedbackSubmissionSchema, LIMITS.ingestBodyMaxBytes);

  // The page the note is about must be on the site that sent it. Otherwise a
  // crafted request could store any address, e.g. a phishing page that the
  // portal's "Show me" link would then send the site owner to.
  if (pageOrigin(submission.context.url) !== c.req.header("Origin")) {
    throw new ApiError(422, "validation_failed", "The page URL must be on the sending site", {
      "context.url": ["Must be on the same origin as the request"],
    });
  }

  // Honeypot: a hidden field real visitors never see. If it's filled in, a bot
  // did it. Pretend it worked so the bot learns nothing, but store nothing.
  if (submission.hp) {
    log("info", "honeypot triggered", { requestId: c.get("requestId"), projectId: project.id });
    return c.json({ id: newId("feedback") }, 202);
  }

  // Rate limit per visitor per project. The IP is hashed together with the
  // project ID, so we never store raw IPs and hashes can't be correlated
  // across projects.
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const visitorKey = await sha256Hex(`${project.id}:${ip}`);
  const rate = await hitRateLimit(c.env.DB, `ingest:${visitorKey}`, RATE_LIMIT);
  if (!rate.allowed) {
    throw new ApiError(429, "rate_limited", "Slow down a little and try again soon", undefined, {
      "Retry-After": String(rate.retryAfter),
    });
  }

  // And a daily cap per site, whoever sends: a flood from many visitors (or
  // many addresses) stops here instead of filling the inbox and the database.
  const perDay = Number(c.env.NOTES_PER_SITE_PER_DAY) || 1000;
  const today = await hitRateLimit(c.env.DB, `site-day:${project.id}`, {
    limit: perDay,
    windowMs: DAY_MS,
  });
  if (!today.allowed) {
    log("warn", "site daily limit reached", {
      requestId: c.get("requestId"),
      projectId: project.id,
    });
    throw new ApiError(
      429,
      "site_limit_reached",
      "This site has had a lot of notes today. Try again tomorrow",
      undefined,
      { "Retry-After": String(today.retryAfter) },
    );
  }

  const { id } = await insertFeedback(c.env.DB, project.id, submission);
  return c.json({ id }, 202);
});

/**
 * "Want to hear back about this?", asked after a note is sent: the
 * visitor's address for that note. Only while the site offers replies.
 */
ingest.post("/:publicKey/feedback/:id/reply", async (c) => {
  const project = await authorizeOrigin(c);
  const { email } = await parseJsonBody(c, replyRequestSchema, 1024);
  if (project.reply_requests !== 1) {
    throw new ApiError(403, "forbidden", "This site doesn't offer replies");
  }
  const ok = await setContactEmail(c.env.DB, project.id, c.req.param("id"), email);
  if (!ok) throw notFound("Note");
  return c.body(null, 204);
});

/**
 * Look up the project and check the request's Origin against its allowlist.
 *
 * Note what this does and doesn't protect against. It stops *other websites*
 * from embedding your key in their pages. It does not stop someone with curl,
 * who can send any Origin they like. That's what rate limits and validation are
 * for. The public key is an identifier, not a secret, just like a Stripe
 * publishable key.
 */
async function authorizeOrigin(c: Context<AppEnv>): Promise<ProjectRow> {
  const project = await getProjectByPublicKey(c.env.DB, c.req.param("publicKey") ?? "");
  if (!project) throw notFound("Project");

  const origin = c.req.header("Origin");
  if (!origin || !allowedOrigins(project).includes(origin)) {
    throw new ApiError(
      403,
      "origin_not_allowed",
      `${origin ?? "This origin"} isn't in this project's allowed origins`,
    );
  }
  return project;
}

function pageOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

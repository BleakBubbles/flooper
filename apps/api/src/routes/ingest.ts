import { LIMITS } from "@flooper/shared";
import { feedbackSubmissionSchema } from "@flooper/shared/schemas";
import { type Context, Hono } from "hono";
import { insertFeedback } from "../db/feedback";
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
 * The project's public key is in the URL (not a header) on purpose: CORS
 * preflight requests don't carry custom headers' values, but they do carry the
 * URL, so the preflight can already check this project's origin allowlist.
 */
export const ingest = new Hono<AppEnv>();

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

ingest.options("/:publicKey/feedback", async (c) => {
  await authorizeOrigin(c);
  c.header("Access-Control-Allow-Methods", "POST");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  // Let the browser cache this preflight for a day instead of repeating it.
  c.header("Access-Control-Max-Age", "86400");
  return c.body(null, 204);
});

ingest.post("/:publicKey/feedback", async (c) => {
  const project = await authorizeOrigin(c);
  const submission = await parseJsonBody(c, feedbackSubmissionSchema, LIMITS.ingestBodyMaxBytes);

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

  const { id } = await insertFeedback(c.env.DB, project.id, submission);
  return c.json({ id }, 202);
});

/**
 * Look up the project and check the request's Origin against its allowlist.
 * On success, sets the CORS headers that let the browser read the response.
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

  c.header("Access-Control-Allow-Origin", origin);
  // Cross-origin JS can only read "safelisted" response headers unless we
  // expose others explicitly. The SDK needs Retry-After to back off politely.
  c.header("Access-Control-Expose-Headers", "Retry-After, X-Request-Id");
  // The response depends on Origin, so caches must not share it across origins.
  c.header("Vary", "Origin");
  return project;
}

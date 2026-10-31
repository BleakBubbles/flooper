import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { log } from "../lib/log";

/**
 * Give every request an ID, echo it in a response header, and log one summary
 * line per request. When someone reports "it broke", the ID in their browser's
 * network tab leads straight to the matching log lines.
 */
export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header("CF-Ray") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  const started = Date.now();

  await next();

  c.header("X-Request-Id", requestId);
  log(c.res.status >= 500 ? "error" : "info", "request", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - started,
  });
});

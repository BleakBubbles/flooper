import { Hono } from "hono";
import { purgeDeleted } from "./db/feedback";
import { resendSender, runDigests } from "./digest";
import type { AppEnv, Bindings } from "./env";
import { ApiError, notFound } from "./lib/errors";
import { log } from "./lib/log";
import { requireTrustedOrigin } from "./middleware/auth";
import { requestContext } from "./middleware/request-context";
import { auth } from "./routes/auth";
import { ingest } from "./routes/ingest";
import { portal } from "./routes/portal";
import { unsubscribe } from "./routes/unsubscribe";

// Request flow:
//
//   /api/v1/ingest/:key/feedback   public, CORS, called by the SDK on any site
//   /api/auth/*                    login/logout (cookie-based)
//   /api/unsubscribe/:token        public, from the link in digest emails
//   /api/v1/*                      portal API (cookie session + origin check)
//   everything else                the portal's static files (see wrangler.jsonc)

const app = new Hono<AppEnv>().basePath("/api");

app.use(requestContext);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/v1/ingest", ingest);
app.route("/unsubscribe", unsubscribe);

app.use("/auth/*", requireTrustedOrigin);
app.route("/auth", auth);

app.use("/v1/*", requireTrustedOrigin);
app.route("/v1", portal);

app.notFound((c) => c.json(notFound("Route").toBody(), 404));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    for (const [name, value] of Object.entries(err.headers ?? {})) c.header(name, value);
    return c.json(err.toBody(), err.status);
  }
  // Unexpected: log everything, tell the client nothing beyond the request ID.
  log("error", "unhandled error", {
    requestId: c.get("requestId"),
    error: err.message,
    stack: err.stack,
  });
  const body = new ApiError(
    500,
    "internal_error",
    `Something went wrong on our end (request ${c.get("requestId")})`,
  ).toBody();
  return c.json(body, 500);
});

export default {
  fetch: app.fetch,
  // The daily digest (see `triggers` in wrangler.jsonc).
  // Once a day (see `triggers` in wrangler.jsonc): the digests, and notes
  // deleted more than 30 days ago go for good.
  scheduled(_controller, env, ctx) {
    const now = Date.now();
    ctx.waitUntil(runDigests(env, now, resendSender(env)));
    ctx.waitUntil(
      purgeDeleted(env.DB, now).then((purged) => log("info", "deleted notes purged", { purged })),
    );
  },
} satisfies ExportedHandler<Bindings>;

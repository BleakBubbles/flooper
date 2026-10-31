# Architecture

Flooper is small, but it's built the way production systems are, on purpose. This
document explains the moving parts and the reasoning behind them. Decisions with
real trade-offs get their own record in [decisions/](decisions/).

## The big picture

```
 visitor's browser                       site owner's browser
 on someone's site                       flooper.example
┌──────────────────┐                    ┌──────────────────┐
│  SDK (flooper.js)  │                    │  Portal (React)  │
│  Shadow DOM UI   │                    │                  │
└────────┬─────────┘                    └────────┬─────────┘
         │ POST /api/v1/ingest/:key/feedback     │ /api/v1/*, /api/auth/*
         │ cross-origin (CORS), no cookies       │ same-origin, session cookie
         ▼                                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Cloudflare Worker (apps/api, Hono)                          │
│   routes/ingest.ts   routes/auth.ts   routes/portal.ts      │
│   middleware: request ID + logging, auth, origin checks     │
│   db/*: all SQL, behind plain functions                     │
│   static assets: portal build + /sdk/flooper.js               │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
                       D1 (SQLite) database
```

There are two very different kinds of client:

|               | SDK (ingest)                                        | Portal                                        |
| ------------- | --------------------------------------------------- | --------------------------------------------- |
| Runs on       | Anyone's website                                    | Our own origin                                |
| Who           | Anonymous visitors                                  | Logged-in site owners                         |
| Auth          | None. The public project key identifies the project | Session cookie                                |
| Cross-origin? | Yes, so CORS with a per-project allowlist           | No, same origin                               |
| Main threats  | Spam, abuse, junk data                              | Session theft, CSRF, seeing other users' data |

Most of the security design follows from that table.

## The contract (`packages/shared`)

The SDK, API and portal all import their types from one package, so a field
renamed in one place is a type error everywhere else. Validation is defined
once, with zod, in `schemas.ts`:

- The **API** runs every request body through a schema (`lib/validate.ts`). If
  it isn't valid, it never reaches a route handler.
- The **portal** and **SDK** use `z.infer` types derived from those schemas.
- The **SDK** only uses `import type`, which is erased at build time, so zod
  never ships in the widget bundle. Zero-dependency constants live separately
  in `index.ts` for the same reason.

## Life of a piece of feedback

1. The visitor clicks a reaction and/or types a note, then hits **Send**.
2. The SDK builds a payload: the note, a page-context snapshot (`context.ts`),
   and a fresh **idempotency key** (a UUID).
3. Because it's a cross-origin JSON POST, the browser first sends a **CORS
   preflight** (`OPTIONS`). The project key is in the URL so the preflight can
   already be checked against the project's allowed origins.
4. The POST is checked again, in order: origin allowlist → body size limit →
   JSON parsing → schema validation → honeypot → rate limit → insert.
5. If the network drops or the server returns 5xx/429, the SDK **retries with
   exponential backoff and jitter**, reusing the same idempotency key. A unique
   index on `(project_id, idempotency_key)` makes the retry a no-op if the first
   attempt actually landed.
6. The site owner sees it in the portal inbox, newest first, loaded page by
   page with **cursor pagination**.

## Security notes

- **The project key is public.** It's like a Stripe publishable key: it says
  which project, not who you are. The **origin allowlist** stops other websites
  from embedding your key. It doesn't stop curl (anyone can fake an `Origin`
  header outside a browser), which is why rate limits and validation exist.
- **Rate limiting** is per visitor per project, keyed on a SHA-256 of
  `projectId:ip`. Raw IPs are never stored.
- **Honeypot:** a hidden form field. Bots fill it in and get a fake success
  response. Nothing is stored, and they learn nothing.
- **Sessions:** a random 256-bit token in an `HttpOnly; SameSite=Lax` cookie
  (`Secure` in production). The database stores only its hash.
- **CSRF:** `SameSite=Lax` is the first line of defense. On top of that, every
  state-changing portal request must carry an `Origin` we trust
  (`middleware/auth.ts`).
- **Authorization:** every query is scoped to the logged-in owner, and other
  people's resources return 404, not 403 (`db/projects.ts`, `routes/portal.ts`).
- **Errors:** expected errors (`ApiError`) have stable codes and safe messages.
  Anything else is logged in full and returned as a generic 500 with a request
  ID, so internals never leak.
- **The widget** sets user-provided text with `textContent`, never `innerHTML`,
  and never sends the host site's cookies (`credentials: "omit"`).

## Observability

Every response carries an `X-Request-Id`. Each request logs one structured JSON
line (method, path, status, duration, request ID), and unexpected errors log
their stack. With Workers observability enabled, you can filter logs by any of
those fields.

## Data model

See [`apps/api/migrations/0001_init.sql`](../apps/api/migrations/0001_init.sql),
which is commented. Migrations are append-only: add a new numbered file, and
never edit one that has already run somewhere.

## Testing strategy

- **API:** integration tests through the Worker's real `fetch` handler, inside
  the Workers runtime, against a freshly migrated local D1. They test behavior
  (status codes, CORS headers, dedupe, rate limits, data isolation), not internals.
- **SDK:** unit tests for retry logic (with injected `fetch` and `sleep`, so
  they're instant and deterministic) and DOM tests of the widget in happy-dom.
- **Shared:** schema tests for the edge cases that matter.
- **CI** runs lint, typecheck, tests, build, and the SDK **size budget**.

## Deliberately not done (yet)

Things a bigger system would have, skipped until they're actually needed:

- A queue between ingest and the database (D1 writes are fast enough here).
- Email notifications, replies to visitors, and the "point at an element" picker.
- Screenshots, which would mean object storage (R2) and a privacy review.
- Multiple members per project, roles, and billing.

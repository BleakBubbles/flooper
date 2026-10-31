# 0001: Run on Cloudflare Workers + D1

**Status:** accepted, 2026-10-30

## Context

Flooper should cost nearly nothing to run with a handful of users, and stay cheap
if it grows. The ingest endpoint is called from browsers all over the world. It's
a passion project, so there should be no servers to patch or babysit.

## Decision

Use one Cloudflare Worker (with Hono as the router) and a D1 (SQLite) database.

## Consequences

- The free tier covers this project's realistic usage. There's no idle cost.
- Requests are handled close to visitors, so the widget feels fast everywhere.
- The Workers runtime isn't Node. Some npm packages won't work, and we use Web
  APIs (`fetch`, `crypto.subtle`) instead. That's a good habit anyway.
- D1 is SQLite: one writer, with modest limits. That's plenty for feedback
  volumes, and plain SQL means moving to Postgres later would be a contained
  change to `src/db/`.
- Hono runs on almost any JS runtime, so the HTTP layer isn't tied to Cloudflare.

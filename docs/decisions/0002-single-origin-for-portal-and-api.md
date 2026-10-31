# 0002: Serve portal and API from one origin

**Status:** accepted, 2026-10-30

## Context

The portal needs authenticated API calls. If the portal and API lived on
different origins (say `app.` and `api.` subdomains, or two different hosts), we'd
need credentialed CORS and cross-site cookie settings, both common sources of
subtle bugs and security mistakes.

## Decision

The API Worker also serves the portal's static build (Workers static assets).
`/api/*` goes to the Worker and everything else is the single-page app. In
development, Vite's proxy recreates the same setup (`localhost:5173/api` →
`localhost:8787`).

## Consequences

- Portal requests are same-origin: no CORS, and a plain `SameSite=Lax`
  session cookie works.
- One deploy ships everything, including the SDK bundle at `/sdk/flooper.js`,
  which also makes self-hosting simpler.
- The only cross-origin surface is the ingest endpoint, which is easier to
  reason about.
- The portal and API deploy together. That's fine at this scale.

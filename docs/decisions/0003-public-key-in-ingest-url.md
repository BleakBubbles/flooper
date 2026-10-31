# 0003: Put the project key in the ingest URL

**Status:** accepted, 2026-10-30

## Context

The SDK has to tell the API which project a submission belongs to. The obvious
options were a header (`X-Flooper-Key`), a body field, or the URL path.

The ingest endpoint is cross-origin and takes JSON, so browsers send a CORS
preflight first. A preflight lists which headers the real request will use,
but not their values, and it carries no body. We want the preflight to answer
"is this origin allowed for _this_ project?"

## Decision

Use `POST /api/v1/ingest/:publicKey/feedback`.

## Consequences

- The preflight can look up the project and check the origin allowlist, so a
  disallowed site fails fast at the preflight.
- The key shows up in access logs. That's fine, because it's public by design.
- Per-project CORS responses depend on `Origin`, so they send `Vary: Origin`.

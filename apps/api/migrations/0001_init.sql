-- Initial schema.
--
-- Conventions:
--   * IDs are prefixed random strings (usr_, prj_, fb_) generated in app code,
--     so you can tell what an ID refers to just by looking at it.
--   * Timestamps are Unix epoch milliseconds (INTEGER). They sort correctly and
--     avoid timezone ambiguity; the API converts them to ISO 8601 on the way out.
--   * Flexible, read-mostly blobs (page context, metadata) are JSON in TEXT columns.
--   * Migrations are append-only: never edit this file once it's been applied
--     anywhere. Add 0002_*.sql instead.

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  github_id   INTEGER NOT NULL UNIQUE,
  login       TEXT NOT NULL,
  name        TEXT,
  avatar_url  TEXT,
  created_at  INTEGER NOT NULL
);

-- We store a SHA-256 hash of the session token, never the token itself, so a
-- leaked database can't be used to hijack sessions.
CREATE TABLE sessions (
  id_hash     TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user_id ON sessions (user_id);

CREATE TABLE projects (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  public_key       TEXT NOT NULL UNIQUE,
  allowed_origins  TEXT NOT NULL DEFAULT '[]', -- JSON array of origins
  created_at       INTEGER NOT NULL
);
CREATE INDEX projects_owner_id ON projects (owner_id);

CREATE TABLE feedback (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'seen', 'done', 'archived')),
  reaction         TEXT CHECK (reaction IN ('love', 'idea', 'confused', 'bug')),
  message          TEXT,
  page_url         TEXT NOT NULL,
  context          TEXT NOT NULL,  -- JSON: viewport, language, user agent, ...
  target           TEXT,           -- JSON: the element the visitor pointed at
  visitor          TEXT,           -- JSON: id/email/name if the site identified them
  metadata         TEXT,           -- JSON: arbitrary key/values from the site
  idempotency_key  TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  -- A retried submission with the same key is recognized instead of duplicated.
  UNIQUE (project_id, idempotency_key)
);
-- Serves the inbox query: newest-first, optionally filtered by status.
CREATE INDEX feedback_project_created ON feedback (project_id, created_at DESC, id DESC);
CREATE INDEX feedback_project_status_created ON feedback (project_id, status, created_at DESC, id DESC);

-- Fixed-window rate limit counters. Keys contain a hash of the client IP,
-- never the raw IP. Old windows are pruned opportunistically.
CREATE TABLE rate_limits (
  key           TEXT NOT NULL,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

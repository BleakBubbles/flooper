-- Review mode ("View on site"): a short-lived, read-only link that lets the
-- widget on the owner's own site show that site's notes over the page.
--
-- review_tokens   One per link the owner opens. Only a hash of the token is
--                 stored, like sessions, so the table can't hand out working
--                 links. Expired rows are cleared as new links are made.
CREATE TABLE review_tokens (
  token_hash  TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX review_tokens_project_id ON review_tokens (project_id);

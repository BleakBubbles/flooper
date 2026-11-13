-- The old rate-limit counters. Since #78, the per-visitor limit is
-- Cloudflare's rate limiter (VISITOR_LIMIT in wrangler.jsonc) and the daily
-- cap per site counts the site's notes, so nothing reads or writes this table.
-- (It was kept one release, as migrations run before the new code is live.)
DROP TABLE IF EXISTS rate_limits;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets. */
  retryAfter: number;
}

/**
 * Fixed-window rate limiting backed by D1: count hits per (key, window) and
 * refuse once the count passes `limit`.
 *
 * This is the simplest algorithm that works. Its known weakness is bursts at
 * window boundaries (up to 2x the limit across two adjacent windows), which is
 * fine for a feedback widget. Cloudflare also offers a built-in Rate Limiting
 * binding; because callers only see this function, swapping it in later would
 * be a change to this one file.
 */
export async function hitRateLimit(
  db: D1Database,
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - (now % opts.windowMs);

  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();

  // Housekeeping: about 1% of calls delete windows older than a day, so the
  // table stays small without needing a cron job.
  if (Math.random() < 0.01) {
    await db
      .prepare("DELETE FROM rate_limits WHERE window_start < ?")
      .bind(now - 24 * 60 * 60 * 1000)
      .run();
  }

  return {
    allowed: (row?.count ?? 0) <= opts.limit,
    retryAfter: Math.ceil((windowStart + opts.windowMs - now) / 1000),
  };
}

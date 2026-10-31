import type { ApiErrorBody } from "@flooper/shared";
import type { FeedbackSubmission } from "@flooper/shared/schemas";

export type SubmitResult = { ok: true; id: string } | { ok: false; message: string };

export interface SubmitOptions {
  apiUrl: string;
  projectKey: string;
  payload: FeedbackSubmission;
  maxAttempts?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** Never make a visitor wait longer than this between attempts. */
const MAX_BACKOFF_MS = 10_000;

/**
 * POST a submission, retrying transient failures (network errors, 5xx, 429)
 * with exponential backoff and jitter. The payload carries an idempotency key,
 * so a retry after a request that actually succeeded can't create a duplicate.
 * Client errors (4xx) aren't retried: sending the same thing again won't help.
 */
export async function submitFeedback(options: SubmitOptions): Promise<SubmitResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = options.maxAttempts ?? 3;
  const url = `${options.apiUrl}/api/v1/ingest/${encodeURIComponent(options.projectKey)}/feedback`;
  const body = JSON.stringify(options.payload);

  let message = "Couldn't reach the server";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let retryAfterMs: number | undefined;
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        // Lets the request finish even if the visitor navigates away.
        keepalive: true,
        // Never send the host site's cookies to us.
        credentials: "omit",
      });
      if (res.ok) {
        const data = (await res.json()) as { id: string };
        return { ok: true, id: data.id };
      }
      // Proxies and CDNs can return errors that aren't ours, so don't assume the shape.
      const error = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
      message = error?.error?.message ?? `Request failed (${res.status})`;
      if (res.status !== 429 && res.status < 500) return { ok: false, message };
      const retryAfter = Number(res.headers.get("Retry-After"));
      if (retryAfter > 0) retryAfterMs = retryAfter * 1000;
    } catch {
      message = "Couldn't reach the server";
    }

    if (attempt === maxAttempts) break;
    // 500ms, 1s, 2s, ... plus up to 250ms of random jitter, so many clients
    // that failed at the same moment don't all retry at the same moment too.
    const delay = retryAfterMs ?? 500 * 2 ** (attempt - 1) + Math.random() * 250;
    if (delay > MAX_BACKOFF_MS) break;
    await sleep(delay);
  }
  return { ok: false, message };
}

import type { FeedbackSubmission } from "@flooper/shared/schemas";
import { describe, expect, it, vi } from "vitest";
import { submitFeedback } from "./api";

const payload: FeedbackSubmission = {
  idempotencyKey: "6f1c2b9e-3d4a-4b5c-8d6e-7f8091a2b3c4",
  reaction: "love",
  context: {
    url: "https://example.com/",
    path: "/",
    viewport: { width: 1, height: 1 },
    sdkVersion: "0.0.0",
  },
};

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function run(fetchImpl: typeof fetch) {
  const sleep = vi.fn(async (_ms: number) => {});
  const result = submitFeedback({
    apiUrl: "https://api.test",
    projectKey: "pk_test",
    payload,
    fetchImpl,
    sleep,
  });
  return { result, sleep };
}

describe("submitFeedback", () => {
  it("posts to the project's ingest URL", async () => {
    const fetchImpl = vi.fn(async () => respond(202, { id: "fb_1" }));
    const { result } = run(fetchImpl);
    expect(await result).toEqual({ ok: true, id: "fb_1" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.test/api/v1/ingest/pk_test/feedback",
      expect.objectContaining({ method: "POST", credentials: "omit" }),
    );
  });

  it("retries server errors with the same body (and idempotency key)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(503, {}))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(respond(202, { id: "fb_1" }));
    const { result, sleep } = run(fetchImpl);
    expect(await result).toEqual({ ok: true, id: "fb_1" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const bodies = fetchImpl.mock.calls.map(([, init]) => init?.body);
    expect(new Set(bodies).size).toBe(1);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry client errors", async () => {
    const fetchImpl = vi.fn(async () =>
      respond(422, { error: { code: "validation_failed", message: "Nope" } }),
    );
    const { result } = run(fetchImpl);
    expect(await result).toEqual({ ok: false, code: "validation_failed", message: "Nope" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After on 429", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(429, {}, { "Retry-After": "2" }))
      .mockResolvedValueOnce(respond(202, { id: "fb_1" }));
    const { result, sleep } = run(fetchImpl);
    await result;
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("gives up after the last attempt", async () => {
    const fetchImpl = vi.fn(async () => respond(500, {}));
    const { result } = run(fetchImpl);
    expect(await result).toMatchObject({ ok: false, code: "internal_error" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("reports an unreachable server as a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { result } = run(fetchImpl);
    expect(await result).toMatchObject({ ok: false, code: "network_error" });
  });

  it("passes on why the site was refused, without retrying", async () => {
    const fetchImpl = vi.fn(async () =>
      respond(403, {
        error: { code: "origin_not_allowed", message: "https://x.example isn't allowed" },
      }),
    );
    const { result } = run(fetchImpl);
    expect(await result).toEqual({
      ok: false,
      code: "origin_not_allowed",
      message: "https://x.example isn't allowed",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

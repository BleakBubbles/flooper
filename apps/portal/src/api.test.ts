import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, request } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("request", () => {
  it("turns a missing connection into a readable error with status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await request("GET", "/v1/me").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 0, code: "network_error" });
    expect((error as Error).message).toMatch(/Couldn't reach Flooper/);
  });

  it("carries the server's error code, message and field details", async () => {
    const body = {
      error: { code: "validation_failed", message: "Bad", details: { name: ["Required"] } },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status: 422 })));
    await expect(request("POST", "/v1/projects", {})).rejects.toMatchObject({
      status: 422,
      code: "validation_failed",
      message: "Bad",
      details: { name: ["Required"] },
    });
  });

  it("copes with an error page that isn't ours (no JSON body)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })));
    await expect(request("GET", "/v1/me")).rejects.toMatchObject({
      status: 502,
      message: "Request failed (502)",
    });
  });
});

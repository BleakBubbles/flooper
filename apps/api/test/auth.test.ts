import { describe, expect, it } from "vitest";
import { request } from "./helpers";

/** Follows nothing: returns where the callback sends the browser. */
async function callback(query: string, cookie?: string) {
  const res = await request(`/api/auth/github/callback?${query}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
  expect(res.status).toBe(302);
  return new URL(res.headers.get("Location") ?? "");
}

describe("GitHub login callback", () => {
  it("sends someone who clicked Cancel back to the login page with a reason", async () => {
    const to = await callback("error=access_denied&state=abc", "flooper_oauth_state=abc");
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("login_error")).toBe("cancelled");
  });

  it("treats a missing or mismatched state as an expired login", async () => {
    expect((await callback("code=c&state=abc")).searchParams.get("login_error")).toBe("expired");
    const mismatched = await callback("code=c&state=abc", "flooper_oauth_state=xyz");
    expect(mismatched.searchParams.get("login_error")).toBe("expired");
  });

  it("never answers with a JSON error page", async () => {
    const res = await request("/api/auth/github/callback", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Content-Type") ?? "").not.toContain("json");
  });
});

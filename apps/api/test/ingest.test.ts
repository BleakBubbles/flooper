import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createProject, json, loginAsDev, request, SITE, submission } from "./helpers";

async function setup() {
  const cookie = await loginAsDev();
  const project = await createProject(cookie);
  const path = `/api/v1/ingest/${project.publicKey}/feedback`;
  return { cookie, project, path };
}

describe("POST /api/v1/ingest/:publicKey/feedback", () => {
  it("accepts feedback from an allowed origin and shows it in the inbox", async () => {
    const { cookie, project, path } = await setup();

    const res = await json("POST", path, submission(), { Origin: SITE });
    expect(res.status).toBe(202);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    const { id } = (await res.json()) as { id: string };
    expect(id).toMatch(/^fb_/);

    const inbox = await request(`/api/v1/projects/${project.id}/feedback`, {
      headers: { Cookie: cookie },
    });
    const body = (await inbox.json()) as { data: { id: string; message: string }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id, message: "cool site!" });
  });

  it("rejects origins that aren't on the allowlist, readably", async () => {
    const { project, path } = await setup();
    const evil = "https://evil.example";
    const res = await json(
      "POST",
      path,
      submission({ context: { ...submission().context, url: `${evil}/` } }),
      { Origin: evil },
    );
    expect(res.status).toBe(403);
    // Readable by the page, so the SDK can say why instead of "network error".
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(evil);
    expect(await res.json()).toMatchObject({ error: { code: "origin_not_allowed" } });

    // ...and nothing was stored.
    const cookie = await loginAsDev();
    const inbox = await request(`/api/v1/projects/${project.id}/feedback?status=new`, {
      headers: { Cookie: cookie },
    });
    expect(((await inbox.json()) as { data: unknown[] }).data).toHaveLength(0);
  });

  it("answers every CORS preflight, so errors on the POST are readable", async () => {
    const { path } = await setup();
    for (const origin of [SITE, "https://not-allowed.example"]) {
      const res = await request(path, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    }
  });

  it("returns a readable 404 for unknown project keys", async () => {
    const res = await json("POST", "/api/v1/ingest/pk_nope/feedback", submission(), {
      Origin: SITE,
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
  });

  it("deduplicates retries with the same idempotency key", async () => {
    const { path } = await setup();
    const payload = submission();
    const first = (await (await json("POST", path, payload, { Origin: SITE })).json()) as {
      id: string;
    };
    const second = (await (await json("POST", path, payload, { Origin: SITE })).json()) as {
      id: string;
    };
    expect(second.id).toBe(first.id);
  });

  it("validates the payload", async () => {
    const { path } = await setup();
    const res = await json("POST", path, submission({ reaction: "angry" }), { Origin: SITE });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: { code: "validation_failed", details: { reaction: expect.any(Array) } },
    });
  });

  it("pretends to accept honeypot submissions but stores nothing", async () => {
    const { cookie, project, path } = await setup();
    const res = await json("POST", path, submission({ hp: "buy cheap stuff" }), { Origin: SITE });
    expect(res.status).toBe(202);

    const inbox = await request(`/api/v1/projects/${project.id}/feedback`, {
      headers: { Cookie: cookie },
    });
    expect(((await inbox.json()) as { data: unknown[] }).data).toHaveLength(0);
  });

  it("rate limits a single visitor, readably", async () => {
    const { path } = await setup();
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 12; i++) {
      last = await json("POST", path, submission(), {
        Origin: SITE,
        "CF-Connecting-IP": "203.0.113.7",
      });
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 202)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // The SDK can read the error and Retry-After, so it can back off.
    expect(last?.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(last?.headers.get("Retry-After")).toMatch(/^\d+$/);
  });

  it("caps a site's notes per day, whoever sends them", async () => {
    const { cookie, project, path } = await setup();
    // Fill today's counter for the site to the cap, as if 1000 notes came in.
    const day = 24 * 60 * 60 * 1000;
    const today = Date.now() - (Date.now() % day);
    await env.DB.prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?)")
      .bind(`site-day:${project.id}`, today, Number(env.NOTES_PER_SITE_PER_DAY))
      .run();

    // A fresh visitor (no per-visitor limit in play) is still refused.
    const res = await json("POST", path, submission(), {
      Origin: SITE,
      "CF-Connecting-IP": "198.51.100.99",
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("site_limit_reached");
    // Until the day turns over: longer than the SDK will wait, so it doesn't retry.
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(10);

    const inbox = await request(`/api/v1/projects/${project.id}/feedback`, {
      headers: { Cookie: cookie },
    });
    expect(((await inbox.json()) as { data: unknown[] }).data).toHaveLength(0);
  });

  it("refuses every note while paused, and accepts them again after", async () => {
    const { path } = await setup();
    env.INGEST_PAUSED = "true";
    try {
      const res = await json("POST", path, submission(), { Origin: SITE });
      expect(res.status).toBe(503);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("paused");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
      expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(10);
    } finally {
      env.INGEST_PAUSED = undefined;
    }
    const after = await json("POST", path, submission(), { Origin: SITE });
    expect(after.status).toBe(202);
  });

  it("rejects a page URL that isn't on the sending site", async () => {
    const { path } = await setup();
    const res = await json(
      "POST",
      path,
      submission({
        context: {
          url: "https://phishing.example/login",
          path: "/login",
          viewport: { width: 1, height: 1 },
          sdkVersion: "0.0.0",
        },
      }),
      { Origin: SITE },
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: { code: "validation_failed", details: { "context.url": expect.any(Array) } },
    });
  });

  it("rejects oversized bodies", async () => {
    const { path } = await setup();
    const res = await json("POST", path, submission({ message: "x".repeat(20_000) }), {
      Origin: SITE,
    });
    expect(res.status).toBe(413);
  });
});

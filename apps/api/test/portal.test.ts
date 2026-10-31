import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { BASE, createProject, json, loginAsDev, request, SITE, submission } from "./helpers";

describe("portal API", () => {
  it("requires a session", async () => {
    const res = await request("/api/v1/projects");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("rejects cookie-authenticated writes from untrusted origins (CSRF)", async () => {
    const cookie = await loginAsDev();
    const res = await json(
      "POST",
      "/api/v1/projects",
      { name: "x" },
      { Cookie: cookie, Origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);
  });

  it("hides other users' projects behind a 404", async () => {
    const cookie = await loginAsDev();
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, login, created_at) VALUES ('usr_other', 99, 'other', 0);`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO projects (id, owner_id, name, public_key, created_at)
       VALUES ('prj_other', 'usr_other', 'Not yours', 'pk_other', 0);`,
    ).run();

    const res = await request("/api/v1/projects/prj_other", { headers: { Cookie: cookie } });
    expect(res.status).toBe(404);
  });

  it("paginates the inbox with a cursor and filters by status", async () => {
    const cookie = await loginAsDev();
    const project = await createProject(cookie);
    const ingestPath = `/api/v1/ingest/${project.publicKey}/feedback`;
    for (let i = 0; i < 5; i++) {
      await json("POST", ingestPath, submission({ message: `note ${i}` }), {
        Origin: SITE,
        "CF-Connecting-IP": `198.51.100.${i}`,
      });
    }

    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs: string = cursor ? `&cursor=${cursor}` : "";
      const res = await request(`/api/v1/projects/${project.id}/feedback?limit=2${qs}`, {
        headers: { Cookie: cookie },
      });
      const page = (await res.json()) as { data: { id: string }[]; nextCursor: string | null };
      for (const item of page.data) seen.add(item.id);
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(seen.size).toBe(5);
    expect(pages).toBe(3);

    const [first] = seen;
    const patched = await json(
      "PATCH",
      `/api/v1/feedback/${first}`,
      { status: "done" },
      { Cookie: cookie, Origin: BASE },
    );
    expect(patched.status).toBe(200);

    const done = await request(`/api/v1/projects/${project.id}/feedback?status=done`, {
      headers: { Cookie: cookie },
    });
    expect(((await done.json()) as { data: unknown[] }).data).toHaveLength(1);
  });

  it("logs out", async () => {
    const cookie = await loginAsDev();
    const out = await request("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie, Origin: BASE },
    });
    expect(out.status).toBe(204);
    const me = await request("/api/v1/me", { headers: { Cookie: cookie } });
    expect(me.status).toBe(401);
  });
});

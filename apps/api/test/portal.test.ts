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

  it("hides other users' notes behind a 404", async () => {
    const cookie = await loginAsDev();
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, login, created_at) VALUES ('usr_y', 97, 'y', 0);`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO projects (id, owner_id, name, public_key, created_at) VALUES ('prj_y', 'usr_y', 'Y', 'pk_y', 0);`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO feedback (id, project_id, message, page_url, context, idempotency_key, created_at)
       VALUES ('fb_y', 'prj_y', 'secret', 'https://y.example/', '{}', 'k', 0);`,
    ).run();
    const res = await request("/api/v1/feedback/fb_y", { headers: { Cookie: cookie } });
    expect(res.status).toBe(404);
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
    const one = await request(`/api/v1/feedback/${first}`, { headers: { Cookie: cookie } });
    expect(one.status).toBe(200);
    expect(await one.json()).toMatchObject({ id: first, projectId: project.id });

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

    const counts = await request(`/api/v1/projects/${project.id}/feedback/counts`, {
      headers: { Cookie: cookie },
    });
    expect(await counts.json()).toMatchObject({
      new: 4,
      seen: 0,
      done: 1,
      archived: 0,
      total: 5,
      latest: { createdAt: expect.any(String), pageUrl: `${SITE}/about` },
    });
  });

  it("deletes a site with its notes, but only the owner's", async () => {
    const cookie = await loginAsDev();
    const project = await createProject(cookie);
    await json("POST", `/api/v1/ingest/${project.publicKey}/feedback`, submission(), {
      Origin: SITE,
    });

    const res = await request(`/api/v1/projects/${project.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: BASE },
    });
    expect(res.status).toBe(204);
    expect(
      (await request(`/api/v1/projects/${project.id}`, { headers: { Cookie: cookie } })).status,
    ).toBe(404);
    const orphans = await env.DB.prepare("SELECT COUNT(*) AS n FROM feedback WHERE project_id = ?")
      .bind(project.id)
      .first<{ n: number }>();
    expect(orphans?.n).toBe(0);

    // Someone else's site: 404, and it's still there.
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, login, created_at) VALUES ('usr_x', 98, 'x', 0);`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO projects (id, owner_id, name, public_key, created_at) VALUES ('prj_x', 'usr_x', 'X', 'pk_x', 0);`,
    ).run();
    const other = await request("/api/v1/projects/prj_x", {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: BASE },
    });
    expect(other.status).toBe(404);
    expect(
      await env.DB.prepare("SELECT id FROM projects WHERE id = 'prj_x'").first(),
    ).not.toBeNull();
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

describe("sessions", () => {
  it("deletes expired sessions when someone logs in, and keeps live ones", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, github_id, login, created_at) VALUES ('usr_s', 96, 's', 0)`,
      ),
      env.DB.prepare(
        `INSERT INTO sessions (id_hash, user_id, created_at, expires_at)
         VALUES ('expired', 'usr_s', 0, 1), ('live', 'usr_s', 0, ?)`,
      ).bind(Date.now() + 60_000),
    ]);

    await loginAsDev();

    const { results } = await env.DB.prepare(
      "SELECT id_hash FROM sessions WHERE user_id = 'usr_s'",
    ).all<{ id_hash: string }>();
    expect(results.map((r) => r.id_hash)).toEqual(["live"]);
  });
});

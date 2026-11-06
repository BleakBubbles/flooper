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

  it("summarizes each site in the sites list", async () => {
    const cookie = await loginAsDev();
    const busy = await createProject(cookie);
    const quiet = await createProject(cookie);
    const ingestPath = `/api/v1/ingest/${busy.publicKey}/feedback`;
    const reactions = ["bug", "bug", "idea"];
    const ids: string[] = [];
    for (const [i, reaction] of reactions.entries()) {
      const res = await json("POST", ingestPath, submission({ reaction }), {
        Origin: SITE,
        "CF-Connecting-IP": `198.51.100.${10 + i}`,
      });
      ids.push(((await res.json()) as { id: string }).id);
    }
    await json("PATCH", `/api/v1/feedback/${ids[2]}`, { status: "done" }, { Cookie: cookie });

    const res = await request("/api/v1/projects", { headers: { Cookie: cookie } });
    const { data } = (await res.json()) as {
      data: { id: string; summary: Record<string, unknown> & { activity: number[] } }[];
    };
    const summary = (id: string) => data.find((p) => p.id === id)?.summary;

    expect(summary(busy.id)).toMatchObject({
      newCount: 2,
      newByReaction: { bug: 2 },
      total: 3,
      lastNoteAt: expect.any(String),
    });
    // All three arrived just now, so they're in the last day's slot.
    expect(summary(busy.id)?.activity).toEqual([...Array(13).fill(0), 3]);
    expect(summary(quiet.id)).toEqual({
      newCount: 0,
      newByReaction: {},
      total: 0,
      lastNoteAt: null,
      activity: Array(14).fill(0),
    });
  });

  it("lists notes across all of a user's sites, and nobody else's", async () => {
    const cookie = await loginAsDev();
    const sites = [await createProject(cookie), await createProject(cookie)];
    let ip = 20;
    for (const site of sites) {
      for (const message of ["first", "second"]) {
        await json("POST", `/api/v1/ingest/${site.publicKey}/feedback`, submission({ message }), {
          Origin: SITE,
          "CF-Connecting-IP": `198.51.100.${ip++}`,
        });
      }
    }
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, login, created_at) VALUES ('usr_z', 95, 'z', 0);`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO projects (id, owner_id, name, public_key, created_at) VALUES ('prj_z', 'usr_z', 'Z', 'pk_z', 0);`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO feedback (id, project_id, message, page_url, context, idempotency_key, created_at)
       VALUES ('fb_z', 'prj_z', 'not yours', 'https://z.example/', '{}', 'k', 0);`,
    ).run();

    type Page = {
      data: { id: string; projectId: string; createdAt: string }[];
      nextCursor: string | null;
    };
    const list = async (qs: string) =>
      (await (
        await request(`/api/v1/feedback?${qs}`, { headers: { Cookie: cookie } })
      ).json()) as Page;

    // Earlier tests left notes on the dev user's other sites, so check these
    // two sites' notes are all there, and that every note is one of the user's.
    const all = await list("limit=100");
    const owned = (await (
      await request("/api/v1/projects", { headers: { Cookie: cookie } })
    ).json()) as {
      data: { id: string }[];
    };
    const ownedIds = new Set(owned.data.map((p) => p.id));
    expect(all.data.filter((n) => sites.some((s) => s.id === n.projectId))).toHaveLength(4);
    expect(all.data.every((n) => ownedIds.has(n.projectId))).toBe(true);
    expect(all.data.map((n) => n.id)).not.toContain("fb_z");

    // Oldest first, two at a time: the same four notes in the reverse order.
    const oldest: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Page = await list(`order=oldest&limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      oldest.push(...page.data.map((n) => n.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(oldest).toEqual(all.data.map((n) => n.id).reverse());

    const first = all.data[0]?.id;
    await json("PATCH", `/api/v1/feedback/${first}`, { status: "seen" }, { Cookie: cookie });
    expect((await list("status=new")).data.map((n) => n.id)).not.toContain(first);
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

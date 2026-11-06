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

  it("lists sites oldest first, so new ones join at the bottom", async () => {
    const cookie = await loginAsDev();
    for (const name of ["zinnia", "Apple", "mango"]) {
      await json("POST", "/api/v1/projects", { name }, { Cookie: cookie });
    }
    const res = await request("/api/v1/projects", { headers: { Cookie: cookie } });
    const names = ((await res.json()) as { data: { name: string }[] }).data
      .map((p) => p.name)
      .filter((n) => ["zinnia", "Apple", "mango"].includes(n));
    expect(names).toEqual(["zinnia", "Apple", "mango"]);
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
      done: 1,
      lastNoteAt: expect.any(String),
    });
    // All three arrived just now, so they're in the last day's slot.
    expect(summary(busy.id)?.activity).toEqual([...Array(13).fill(0), 3]);
    expect(summary(quiet.id)).toEqual({
      newCount: 0,
      newByReaction: {},
      total: 0,
      done: 0,
      archived: 0,
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
      const page: Page = await list(
        `sort=time&dir=asc&limit=2${cursor ? `&cursor=${cursor}` : ""}`,
      );
      oldest.push(...page.data.map((n) => n.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(oldest).toEqual(all.data.map((n) => n.id).reverse());

    const first = all.data[0]?.id;
    await json("PATCH", `/api/v1/feedback/${first}`, { status: "seen" }, { Cookie: cookie });
    expect((await list("status=new")).data.map((n) => n.id)).not.toContain(first);

    // One site at a time, but never someone else's.
    const one = await list(`projectId=${sites[0]?.id}&limit=100`);
    expect(one.data.map((n) => n.projectId)).toEqual([sites[0]?.id, sites[0]?.id]);
    expect((await list("projectId=prj_z&limit=100")).data).toHaveLength(0);

    // Archived notes leave the list, unless that's what's asked for.
    const second = all.data[1]?.id;
    await json("PATCH", `/api/v1/feedback/${second}`, { status: "archived" }, { Cookie: cookie });
    expect((await list("limit=100")).data.map((n) => n.id)).not.toContain(second);
    expect((await list("status=archived&limit=100")).data.map((n) => n.id)).toContain(second);
  });

  it("sorts notes across sites by any column, and pages through them in that order", async () => {
    const cookie = await loginAsDev();
    const me = (await (await request("/api/v1/me", { headers: { Cookie: cookie } })).json()) as {
      id: string;
    };
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO projects (id, owner_id, name, public_key, created_at) VALUES
           ('prj_b', ?1, 'Beta', 'pk_b', 0), ('prj_a', ?1, 'alpha', 'pk_a', 0)`,
      ).bind(me.id),
      env.DB.prepare(
        `INSERT INTO feedback (id, project_id, reaction, message, page_url, context, idempotency_key, created_at) VALUES
           ('fb_1', 'prj_b', 'love', 'zebra', 'https://b.example/z', '{}', 'k1', 1),
           ('fb_2', 'prj_a', 'bug',  'apple', 'https://a.example/a', '{}', 'k2', 2),
           ('fb_3', 'prj_b', NULL,   'Mango', 'https://b.example/m', '{}', 'k3', 3),
           ('fb_4', 'prj_a', 'idea', NULL,    'https://a.example/b', '{}', 'k4', 4)`,
      ),
    ]);

    // Every page of a sort, one note at a time, keeping only these four notes.
    const ours = new Set(["fb_1", "fb_2", "fb_3", "fb_4"]);
    const sorted = async (qs: string) => {
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const res = await request(
          `/api/v1/feedback?${qs}&limit=1${cursor ? `&cursor=${cursor}` : ""}`,
          {
            headers: { Cookie: cookie },
          },
        );
        const page = (await res.json()) as { data: { id: string }[]; nextCursor: string | null };
        ids.push(...page.data.map((n) => n.id));
        cursor = page.nextCursor;
      } while (cursor);
      return ids.filter((id) => ours.has(id));
    };

    // Within a site, newest first, whichever way the sites run.
    expect(await sorted("sort=site&dir=asc")).toEqual(["fb_4", "fb_2", "fb_3", "fb_1"]);
    expect(await sorted("sort=site&dir=desc")).toEqual(["fb_3", "fb_1", "fb_4", "fb_2"]);
    expect(await sorted("sort=reaction&dir=asc")).toEqual(["fb_2", "fb_4", "fb_1", "fb_3"]);
    expect(await sorted("sort=note&dir=asc")).toEqual(["fb_4", "fb_2", "fb_3", "fb_1"]);
    expect(await sorted("sort=page&dir=asc")).toEqual(["fb_2", "fb_4", "fb_3", "fb_1"]);
    expect(await sorted("sort=time&dir=asc")).toEqual(["fb_1", "fb_2", "fb_3", "fb_4"]);
  });

  it("marks every new note across the user's sites as read, and nobody else's", async () => {
    const cookie = await loginAsDev();
    const site = await createProject(cookie);
    for (const i of [0, 1]) {
      await json("POST", `/api/v1/ingest/${site.publicKey}/feedback`, submission(), {
        Origin: SITE,
        "CF-Connecting-IP": `198.51.100.${40 + i}`,
      });
    }
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, login, created_at) VALUES ('usr_w', 94, 'w', 0);`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO projects (id, owner_id, name, public_key, created_at) VALUES ('prj_w', 'usr_w', 'W', 'pk_w', 0);`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO feedback (id, project_id, message, page_url, context, idempotency_key, created_at)
       VALUES ('fb_w', 'prj_w', 'theirs', 'https://w.example/', '{}', 'k', 0);`,
    ).run();

    // Just one site first: the other site's note stays new.
    const other = await createProject(cookie);
    await json("POST", `/api/v1/ingest/${other.publicKey}/feedback`, submission(), {
      Origin: SITE,
      "CF-Connecting-IP": "198.51.100.45",
    });
    const one = await json(
      "POST",
      "/api/v1/feedback/mark-all-read",
      { projectId: site.id },
      { Cookie: cookie },
    );
    expect(((await one.json()) as { updated: number }).updated).toBe(2);
    const stillNew = await request(`/api/v1/feedback?status=new&projectId=${other.id}`, {
      headers: { Cookie: cookie },
    });
    expect(((await stillNew.json()) as { data: unknown[] }).data).toHaveLength(1);

    const res = await json("POST", "/api/v1/feedback/mark-all-read", {}, { Cookie: cookie });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { updated: number }).updated).toBeGreaterThanOrEqual(1);

    const left = await request("/api/v1/feedback?status=new", { headers: { Cookie: cookie } });
    expect(((await left.json()) as { data: unknown[] }).data).toHaveLength(0);
    const theirs = await env.DB.prepare("SELECT status FROM feedback WHERE id = 'fb_w'").first();
    expect(theirs).toEqual({ status: "new" });
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

  it("sets a readable signed-in hint beside the session, and clears both on logout", async () => {
    const login = await request("/api/auth/dev-login", {
      method: "POST",
      headers: { Origin: BASE },
    });
    const set = login.headers.getSetCookie();
    const session = set.find((c) => c.startsWith("flooper_session="));
    const hint = set.find((c) => c.startsWith("flooper_signed_in="));
    expect(session).toMatch(/HttpOnly/i);
    expect(hint).toMatch(/^flooper_signed_in=1;/);
    expect(hint).not.toMatch(/HttpOnly/i);

    // /me renews it, for anyone who logged in before the hint existed.
    const me = await request("/api/v1/me", {
      headers: { Cookie: (session ?? "").split(";")[0] ?? "" },
    });
    expect(me.headers.getSetCookie().some((c) => c.startsWith("flooper_signed_in=1;"))).toBe(true);

    const out = await request("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: (session ?? "").split(";")[0] ?? "", Origin: BASE },
    });
    const cleared = out.headers.getSetCookie();
    expect(cleared.some((c) => /^flooper_session=;.*Max-Age=0/i.test(c))).toBe(true);
    expect(cleared.some((c) => /^flooper_signed_in=;.*Max-Age=0/i.test(c))).toBe(true);
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

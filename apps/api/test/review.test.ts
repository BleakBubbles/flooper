import { env } from "cloudflare:workers";
import type { ReviewPage } from "@flooper/shared/schemas";
import { describe, expect, it } from "vitest";
import { BASE, createProject, json, loginAsDev, request, SITE, submission } from "./helpers";

/** A site with notes on /checkout (two on the Pay button, one on nothing) and one elsewhere. */
async function setup() {
  const cookie = await loginAsDev();
  const project = await createProject(cookie);
  let ip = 60;
  const send = async (overrides: Record<string, unknown>) => {
    const res = await json(
      "POST",
      `/api/v1/ingest/${project.publicKey}/feedback`,
      submission(overrides),
      { Origin: SITE, "CF-Connecting-IP": `203.0.113.${ip++}` },
    );
    expect(res.status).toBe(202);
  };
  const checkout = (path = "/checkout") => ({
    url: `${SITE}${path}`,
    path,
    viewport: { width: 1280, height: 800 },
    sdkVersion: "0.0.0",
  });
  const pay = { selector: "button#pay", text: "Pay $12" };
  await send({ context: checkout(), target: pay, reaction: "bug", message: "Does nothing" });
  await send({ context: checkout(), target: pay, reaction: "confused", message: "Pay what?" });
  await send({ context: checkout(), reaction: "love", message: "Nice page" });
  await send({ context: checkout("/about"), target: pay, reaction: "bug" });

  const link = async (body: Record<string, unknown> = { path: "/checkout" }) =>
    json("POST", `/api/v1/projects/${project.id}/review`, body, { Cookie: cookie });
  const read = (token: string, path = "/checkout", origin = SITE, key = project.publicKey) =>
    request(`/api/v1/ingest/${key}/review?path=${encodeURIComponent(path)}`, {
      headers: { Origin: origin, Authorization: `Bearer ${token}` },
    });
  return { cookie, project, link, read };
}

const tokenOf = (url: string) => url.split("#flooper-review=")[1] ?? "";

describe("review mode", () => {
  it("makes a link to the site, with the token in the fragment", async () => {
    const { link } = await setup();
    const res = await link();
    expect(res.status).toBe(200);
    const { url, expiresAt } = (await res.json()) as { url: string; expiresAt: string };
    expect(url).toMatch(new RegExp(`^${SITE}/checkout#flooper-review=[A-Za-z0-9_-]{40,}$`));
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    // The home page when no path is given.
    const home = (await (await link({})).json()) as { url: string };
    expect(home.url.startsWith(`${SITE}/#flooper-review=`)).toBe(true);
  });

  it("opens the page a note was on: its query, and only the site's own addresses", async () => {
    const { link } = await setup();
    const res = await link({ path: "/checkout?step=2", origin: SITE });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url.startsWith(`${SITE}/checkout?step=2#flooper-review=`)).toBe(true);

    const elsewhere = await link({ path: "/", origin: "https://evil.example" });
    expect(elsewhere.status).toBe(400);
  });

  it("gives the page's notes by element, busiest first, without visitor details", async () => {
    const { link, read } = await setup();
    const { url } = (await (await link()).json()) as { url: string };
    const res = await read(tokenOf(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const page = (await res.json()) as ReviewPage;

    expect(page.path).toBe("/checkout");
    expect(page.elements).toHaveLength(1);
    expect(page.elements[0]).toMatchObject({
      selector: "button#pay",
      text: "Pay $12",
      total: 2,
      counts: { bug: 1, confused: 1, love: 0, idea: 0, none: 0 },
    });
    expect(page.elements[0]?.notes.map((n) => n.message)).toEqual(["Pay what?", "Does nothing"]);
    expect(page.unpinned.map((n) => n.message)).toEqual(["Nice page"]);
    expect(page.truncated).toBe(false);
    // Three on /checkout, one on /about.
    expect(page.siteTotal).toBe(4);
    // Every page with notes, busiest first.
    expect(page.pages).toEqual([
      { path: "/checkout", total: 3 },
      { path: "/about", total: 1 },
    ]);
    // Shown on the live site: nothing about who sent them.
    expect(JSON.stringify(page)).not.toMatch(/visitor|contactEmail|userAgent/);
  });

  it("only opens its own site, from its own addresses, while it lasts", async () => {
    const { link, read } = await setup();
    const { url } = (await (await link()).json()) as { url: string };
    const token = tokenOf(url);

    expect((await read("not-a-token")).status).toBe(401);
    expect((await read(token, "/checkout", "https://evil.example")).status).toBe(403);
    const other = await setup();
    expect((await read(token, "/checkout", SITE, other.project.publicKey)).status).toBe(401);
    expect((await read(token, "checkout")).status).toBe(422);

    await env.DB.prepare("UPDATE review_tokens SET expires_at = ?")
      .bind(Date.now() - 1)
      .run();
    expect((await read(token)).status).toBe(401);
  });

  it("works on Flooper's own site, where the browser sends no Origin", async () => {
    const cookie = await loginAsDev();
    const own = await createProject(cookie, [BASE]);
    const res = await json("POST", `/api/v1/projects/${own.id}/review`, {}, { Cookie: cookie });
    const { url } = (await res.json()) as { url: string };
    const read = (headers: Record<string, string>) =>
      request(`/api/v1/ingest/${own.publicKey}/review?path=/`, {
        headers: { Authorization: `Bearer ${tokenOf(url)}`, ...headers },
      });
    expect((await read({ "Sec-Fetch-Site": "same-origin" })).status).toBe(200);
    // Neither header: nothing vouches for where it came from.
    expect((await read({})).status).toBe(403);
  });

  it("needs the site to be yours, and to have an address", async () => {
    const { cookie } = await setup();
    const res = await json("POST", "/api/v1/projects/prj_nope/review", {}, { Cookie: cookie });
    expect(res.status).toBe(404);

    const bare = await createProject(cookie, []);
    const none = await json("POST", `/api/v1/projects/${bare.id}/review`, {}, { Cookie: cookie });
    expect(none.status).toBe(409);
  });

  it("changes a note's status from review mode, on its own site only", async () => {
    const { link, read, project } = await setup();
    const token = tokenOf(((await (await link()).json()) as { url: string }).url);
    const page = (await (await read(token)).json()) as ReviewPage;
    const id = page.elements[0]?.notes[0]?.id ?? "";
    const act = (body: unknown, opts: { token?: string; origin?: string; id?: string } = {}) =>
      json("POST", `/api/v1/ingest/${project.publicKey}/review/notes/${opts.id ?? id}`, body, {
        Origin: opts.origin ?? SITE,
        Authorization: `Bearer ${opts.token ?? token}`,
      });

    const done = await act({ status: "done" });
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ id, status: "done" });
    const after = (await (await read(token)).json()) as ReviewPage;
    expect(after.elements[0]?.notes.find((n) => n.id === id)?.status).toBe("done");

    // Archived: gone from review mode, like everywhere archived notes are.
    expect((await act({ status: "archived" })).status).toBe(200);
    const archived = (await (await read(token)).json()) as ReviewPage;
    expect(archived.siteTotal).toBe(3);

    expect((await act({ status: "nonsense" })).status).toBe(422);
    expect((await act({ status: "done" }, { token: "wrong" })).status).toBe(401);
    expect((await act({ status: "done" }, { origin: "https://evil.example" })).status).toBe(403);
    // Another site's note, or none at all: not found.
    expect((await act({ status: "done" }, { id: "fb_nope" })).status).toBe(404);
  });

  it("finds a page's notes by the page path index, not by reading the whole site", async () => {
    const plan = async (sql: string) =>
      (await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).all<{ detail: string }>()).results
        .map((r) => r.detail)
        .join(" | ");
    // Review mode's page.
    expect(
      await plan(`SELECT id FROM feedback WHERE project_id = 'p' AND deleted_at IS NULL
        AND status <> 'archived' AND json_extract(context, '$.path') = '/'`),
    ).toContain("feedback_project_path");
    // The site's pages, and the app's notes grouped by page.
    expect(
      await plan(`SELECT json_extract(context, '$.path') AS path, COUNT(*) FROM feedback
        WHERE project_id = 'p' GROUP BY path`),
    ).toContain("feedback_project_path");
    expect(
      await plan(`SELECT f.id FROM feedback f WHERE f.project_id = 'p'
        AND json_extract(f.context, '$.path') = '/'`),
    ).toContain("feedback_project_path");
  });

  it("lets the widget ask with an Authorization header from another origin", async () => {
    const { project } = await setup();
    const res = await request(`/api/v1/ingest/${project.publicKey}/review`, {
      method: "OPTIONS",
      headers: { Origin: SITE, "Access-Control-Request-Headers": "authorization" },
    });
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});

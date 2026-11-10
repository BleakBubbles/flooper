import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { csvCell } from "../src/db/export";
import { createProject, json, loginAsDev, request, SITE, submission } from "./helpers";

async function sendNote(publicKey: string, message: string, ip: string) {
  const res = await json(
    "POST",
    `/api/v1/ingest/${publicKey}/feedback`,
    submission({ message, reaction: "bug" }),
    { Origin: SITE, "CF-Connecting-IP": ip },
  );
  expect(res.status).toBe(202);
}

describe("CSV cells", () => {
  it("quotes what needs quoting, and defuses spreadsheet formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(null)).toBe("");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    // A visitor's note that a spreadsheet would otherwise run.
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@sum")).toBe("'@sum");
  });
});

describe("export notes", () => {
  it("downloads every note on your sites, not deleted ones, and never anyone else's", async () => {
    const cookie = await loginAsDev();
    const site = await createProject(cookie);
    await sendNote(site.publicKey, "Checkout breaks", "203.0.113.120");
    await sendNote(site.publicKey, "=1+1", "203.0.113.121");
    await sendNote(site.publicKey, "delete me", "203.0.113.122");
    const list = (await (
      await request(`/api/v1/feedback?projectId=${site.id}`, { headers: { Cookie: cookie } })
    ).json()) as { data: { id: string; message: string }[] };
    const doomed = list.data.find((n) => n.message === "delete me")?.id as string;
    await json("POST", "/api/v1/feedback/delete", { ids: [doomed] }, { Cookie: cookie });
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, login, created_at) VALUES ('usr_s', 90, 's', 0);`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO projects (id, owner_id, name, public_key, created_at) VALUES ('prj_s', 'usr_s', 'S', 'pk_s', 0);`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO feedback (id, project_id, message, page_url, context, idempotency_key, created_at)
       VALUES ('fb_s', 'prj_s', 'not yours', 'https://s.example/', '{}', 'k', 0);`,
    ).run();

    const res = await request(`/api/v1/export.csv?projectId=${site.id}`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="flooper-notes-/);
    const lines = (await res.text()).replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toMatch(/^Site,Received \(UTC\),Status,Reaction,Message,Page/);
    expect(lines).toHaveLength(3);
    const body = lines.slice(1).join("\n");
    expect(body).toContain("Checkout breaks");
    expect(body).toContain("'=1+1");
    expect(body).not.toContain("delete me");

    // Every site: still never someone else's notes.
    const all = await (await request("/api/v1/export.csv", { headers: { Cookie: cookie } })).text();
    expect(all).not.toContain("not yours");

    // Signed out: nothing.
    expect((await request("/api/v1/export.csv")).status).toBe(401);
  });
});

describe("delete account", () => {
  it("needs your username, then removes your sites, notes and sessions, and signs you out", async () => {
    const cookie = await loginAsDev();
    const site = await createProject(cookie);
    await sendNote(site.publicKey, "bye", "203.0.113.130");
    const me = (await (await request("/api/v1/me", { headers: { Cookie: cookie } })).json()) as {
      id: string;
      login: string;
    };

    const wrong = await json(
      "DELETE",
      "/api/v1/me",
      { confirm: "someone-else" },
      { Cookie: cookie },
    );
    expect(wrong.status).toBe(422);
    expect((await request("/api/v1/me", { headers: { Cookie: cookie } })).status).toBe(200);

    const res = await json(
      "DELETE",
      "/api/v1/me",
      { confirm: ` ${me.login.toUpperCase()} ` },
      { Cookie: cookie },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);

    // Signed out, and nothing of theirs is left.
    expect((await request("/api/v1/me", { headers: { Cookie: cookie } })).status).toBe(401);
    const left = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE id = ?").bind(me.id),
      env.DB.prepare("SELECT COUNT(*) AS n FROM projects WHERE owner_id = ?").bind(me.id),
      env.DB.prepare("SELECT COUNT(*) AS n FROM feedback WHERE project_id = ?").bind(site.id),
      env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").bind(me.id),
    ]);
    expect(left.map((r) => (r.results[0] as { n: number }).n)).toEqual([0, 0, 0, 0]);

    // The site's widget stops accepting notes.
    const after = await json("POST", `/api/v1/ingest/${site.publicKey}/feedback`, submission(), {
      Origin: SITE,
      "CF-Connecting-IP": "203.0.113.131",
    });
    expect(after.status).toBe(404);
  });
});

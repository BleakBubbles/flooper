import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { buildReplyEmail } from "../src/reply";
import { createProject, json, loginAsDev, request, SITE, submission } from "./helpers";

/** A site, and a note on it whose visitor asked to hear back. */
async function setup({ ownerEmail = "owner@example.com" as string | null } = {}) {
  const cookie = await loginAsDev();
  await json(
    "PUT",
    "/api/v1/me/notifications",
    { email: ownerEmail, digestEnabled: false },
    { Cookie: cookie },
  );
  const project = await createProject(cookie);
  const send = async (contactEmail?: string) => {
    const res = await json(
      "POST",
      `/api/v1/ingest/${project.publicKey}/feedback`,
      submission({ message: "The menu covers the logo" }),
      { Origin: SITE, "CF-Connecting-IP": `203.0.113.${Math.floor(Math.random() * 200)}` },
    );
    const { id } = (await res.json()) as { id: string };
    if (contactEmail) {
      await json(
        "POST",
        `/api/v1/ingest/${project.publicKey}/feedback/${id}/reply`,
        { email: contactEmail },
        { Origin: SITE },
      );
    }
    return id;
  };
  const reply = (id: string, message?: string) =>
    json("POST", `/api/v1/feedback/${id}/reply`, { message }, { Cookie: cookie });
  return { cookie, project, send, reply };
}

describe("POST /api/v1/feedback/:id/reply", () => {
  it("emails the visitor once, and marks the note replied", async () => {
    const { send, reply } = await setup();
    const id = await send("visitor@example.com");

    const res = await reply(id, "Fixed it, thanks!");
    expect(res.status).toBe(200);
    const note = (await res.json()) as { repliedAt: string | null };
    expect(note.repliedAt).toEqual(expect.any(String));

    // One email per note.
    expect((await reply(id)).status).toBe(409);
  });

  it("refuses notes without an address, and owners without one", async () => {
    const { send, reply } = await setup();
    expect((await reply(await send())).status).toBe(409);

    const noEmail = await setup({ ownerEmail: null });
    const id = await noEmail.send("visitor@example.com");
    const res = await noEmail.reply(id);
    expect(res.status).toBe(422);
    // Nothing was claimed, so it can still be sent once the owner adds one.
    const row = await env.DB.prepare("SELECT replied_at FROM feedback WHERE id = ?")
      .bind(id)
      .first<{ replied_at: number | null }>();
    expect(row?.replied_at).toBeNull();
  });

  it("404s for notes that aren't yours", async () => {
    const { reply } = await setup();
    expect((await reply("fb_nope")).status).toBe(404);
  });
});

describe("the one-time replies prompt", () => {
  it("shows for sites with replies off until the owner chooses", async () => {
    const cookie = await loginAsDev();
    const project = await createProject(cookie);
    const get = async () =>
      (await (
        await request(`/api/v1/projects/${project.id}`, { headers: { Cookie: cookie } })
      ).json()) as { replyPrompt: boolean };

    // New sites already ask visitors: nothing to prompt about.
    expect((await get()).replyPrompt).toBe(false);

    // A site from before replies existed.
    await env.DB.prepare(
      "UPDATE projects SET reply_requests = 0, reply_prompt_seen = 0 WHERE id = ?",
    )
      .bind(project.id)
      .run();
    expect((await get()).replyPrompt).toBe(true);

    // "Not now" is choosing off; renaming isn't choosing.
    await json("PATCH", `/api/v1/projects/${project.id}`, { name: "Renamed" }, { Cookie: cookie });
    expect((await get()).replyPrompt).toBe(true);
    await json(
      "PATCH",
      `/api/v1/projects/${project.id}`,
      { replyRequests: false },
      { Cookie: cookie },
    );
    expect((await get()).replyPrompt).toBe(false);
  });
});

describe("buildReplyEmail", () => {
  const base = {
    to: "visitor@example.com",
    pageUrl: "https://www.my-site.example/pricing",
    ownerEmail: "owner@example.com",
    from: "Flooper <notes@flooper.app>",
    note: "The <menu> covers the logo",
  };

  it("names the website by its address, replies go to the owner, and the note is quoted", () => {
    const email = buildReplyEmail({ ...base, done: true, message: "" });
    // Never the site's name in Flooper: visitors never saw it.
    expect(email.from).toBe('"my-site.example via Flooper" <notes@flooper.app>');
    expect(email.subject).toBe("About your note on my-site.example");
    expect(email.replyTo).toBe("owner@example.com");
    expect(email.text).toContain("Your note on my-site.example has been addressed.");
    expect(email.text).toContain("> The <menu> covers the logo");
    expect(email.html).toContain("The &lt;menu&gt; covers the logo");
    expect(email.unsubscribeUrl).toBeUndefined();
  });

  it("says it's being looked into when the note isn't done, and uses the owner's words if any", () => {
    expect(buildReplyEmail({ ...base, done: false }).text).toContain("being looked into");
    const own = buildReplyEmail({ ...base, done: true, message: "Fixed, thanks!" });
    expect(own.text.startsWith("Fixed, thanks!")).toBe(true);
    expect(own.text).not.toContain("addressed");
  });

  it("fits the standard line to the note's reaction", () => {
    const line = (reaction: "bug" | "idea" | "love", done: boolean) =>
      buildReplyEmail({ ...base, reaction, done }).text;
    expect(line("bug", true)).toContain(
      "The problem you reported on my-site.example has been fixed",
    );
    expect(line("idea", false)).toContain("it's being considered");
    expect(line("love", false)).toBe(line("love", true));
  });
});

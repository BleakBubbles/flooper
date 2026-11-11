import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { type Email, runDigests, runInstantEmails } from "../src/digest";
import { createProject, json, loginAsDev, request, SITE, submission } from "./helpers";

async function me(cookie: string) {
  const res = await request("/api/v1/me", { headers: { Cookie: cookie } });
  return (await res.json()) as { email: string | null; noteEmails: string };
}

async function turnOn(cookie: string, email = "owner@example.com") {
  return json(
    "PUT",
    "/api/v1/me/notifications",
    { email, noteEmails: "daily" },
    { Cookie: cookie },
  );
}

async function sendNote(publicKey: string, message: string, ip: string) {
  const res = await json(
    "POST",
    `/api/v1/ingest/${publicKey}/feedback`,
    submission({ message, reaction: "idea" }),
    { Origin: SITE, "CF-Connecting-IP": ip },
  );
  expect(res.status).toBe(202);
}

/** Now, a few milliseconds on, so notes and runs never share a timestamp. */
async function later(): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return Date.now();
}

/** A sender that records what it was given instead of emailing anyone. */
function recorder(ok = true) {
  const sent: Email[] = [];
  const send = async (email: Email) => {
    sent.push(email);
    return ok;
  };
  return { sent, send };
}

async function unsubscribeToken(): Promise<string> {
  const row = await env.DB.prepare("SELECT unsubscribe_token FROM users WHERE id = 'usr_dev'")
    .first<{ unsubscribe_token: string }>()
    .catch(() => null);
  if (row) return row.unsubscribe_token;
  const any = await env.DB.prepare("SELECT unsubscribe_token FROM users LIMIT 1").first<{
    unsubscribe_token: string;
  }>();
  return any?.unsubscribe_token ?? "";
}

describe("notification settings", () => {
  it("starts off, with the address from sign-in, and won't turn on without one", async () => {
    const cookie = await loginAsDev();
    expect(await me(cookie)).toMatchObject({ email: "dev@example.com", noteEmails: "off" });

    const noEmail = await json(
      "PUT",
      "/api/v1/me/notifications",
      { email: null, noteEmails: "daily" },
      { Cookie: cookie },
    );
    expect(noEmail.status).toBe(422);

    const res = await turnOn(cookie);
    expect(res.status).toBe(200);
    expect(await me(cookie)).toMatchObject({ email: "owner@example.com", noteEmails: "daily" });
  });

  it("keeps an address you changed when you sign in again", async () => {
    const cookie = await loginAsDev();
    await turnOn(cookie, "mine@example.com");
    const again = await loginAsDev();
    expect((await me(again)).email).toBe("mine@example.com");
  });
});

describe("unsubscribe", () => {
  it("switches the digest off from the email's link, without signing in", async () => {
    const cookie = await loginAsDev();
    await turnOn(cookie);
    const token = await unsubscribeToken();

    const page = await request(`/api/unsubscribe/${token}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("unsubscribed");
    expect((await me(cookie)).noteEmails).toBe("off");
  });

  it("supports mail apps' one-click POST, and gives nothing away for unknown tokens", async () => {
    const cookie = await loginAsDev();
    await turnOn(cookie);
    const token = await unsubscribeToken();

    const unknown = await request("/api/unsubscribe/not-a-real-token", { method: "POST" });
    expect(unknown.status).toBe(204);
    expect((await me(cookie)).noteEmails).toBe("daily");

    const oneClick = await request(`/api/unsubscribe/${token}`, { method: "POST" });
    expect(oneClick.status).toBe(204);
    expect((await me(cookie)).noteEmails).toBe("off");
  });
});

describe("the daily digest", () => {
  it("sends one email per user with their new notes, escaped, and nothing twice", async () => {
    const cookie = await loginAsDev();
    await turnOn(cookie);
    const site = await createProject(cookie);
    await sendNote(site.publicKey, "Love it", "203.0.113.1");
    await sendNote(site.publicKey, "<script>alert(1)</script>", "203.0.113.2");

    const first = recorder();
    expect(await runDigests(env, await later(), first.send)).toBe(1);
    expect(first.sent).toHaveLength(1);
    const email = first.sent[0] as Email;
    expect(email.to).toBe("owner@example.com");
    expect(email.subject).toBe(`2 new notes on Test site`);
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.unsubscribeUrl).toMatch(/\/api\/unsubscribe\/.+/);
    expect(email.text).toContain("Your email setting: Daily digest");

    // The next run has nothing new to say.
    const second = recorder();
    expect(await runDigests(env, await later(), second.send)).toBe(0);
    expect(second.sent).toHaveLength(0);
  });

  it("tries again next run when the provider refuses", async () => {
    const cookie = await loginAsDev();
    await turnOn(cookie);
    const site = await createProject(cookie);
    await sendNote(site.publicKey, "Hello", "203.0.113.3");

    const refused = recorder(false);
    expect(await runDigests(env, await later(), refused.send)).toBe(0);
    const retried = recorder();
    expect(await runDigests(env, await later(), retried.send)).toBe(1);
    expect(retried.sent[0]?.subject).toBe(`1 new note on Test site`);
  });

  it("leaves out people who have it switched off", async () => {
    const cookie = await loginAsDev();
    // (Earlier tests in this file share the database and left it on.)
    const off = await json(
      "PUT",
      "/api/v1/me/notifications",
      { email: "owner@example.com", noteEmails: "off" },
      { Cookie: cookie },
    );
    expect(off.status).toBe(200);
    const site = await createProject(cookie);
    await sendNote(site.publicKey, "Hello", "203.0.113.4");
    const run = recorder();
    expect(await runDigests(env, await later(), run.send)).toBe(0);
    expect(run.sent).toHaveLength(0);
  });
});

describe("emails as notes arrive", () => {
  async function choose(cookie: string, noteEmails: "off" | "daily" | "instant") {
    const res = await json(
      "PUT",
      "/api/v1/me/notifications",
      { email: "owner@example.com", noteEmails },
      { Cookie: cookie },
    );
    expect(res.status).toBe(200);
  }
  // Real time, with the gap between emails shortened (5 minutes for real).
  const NO_GAP = 0;
  const SHORT_GAP = 300;

  it("emails a note that just arrived, says what it is, and never twice", async () => {
    const cookie = await loginAsDev();
    await choose(cookie, "instant");
    const site = await createProject(cookie);
    await sendNote(site.publicKey, "The menu covers the logo", "203.0.113.20");

    // Not the daily digest's business any more.
    const daily = recorder();
    expect(await runDigests(env, await later(), daily.send)).toBe(0);

    const run = recorder();
    expect(await runInstantEmails(env, await later(), run.send, NO_GAP)).toBe(1);
    expect(run.sent[0]?.subject).toBe("New note on Test site: The menu covers the logo");
    expect(run.sent[0]?.text).toContain("A new note on Test site.");
    expect(run.sent[0]?.text).toContain("Your email setting: All notes");
    expect(run.sent[0]?.html).toContain("/?view=account");
    expect(run.sent[0]?.unsubscribeUrl).toMatch(/\/api\/unsubscribe\/.+/);

    const again = recorder();
    expect(await runInstantEmails(env, await later(), again.send, NO_GAP)).toBe(0);
  });

  it("holds notes that arrive soon after an email, then sends them together", async () => {
    const cookie = await loginAsDev();
    await choose(cookie, "instant");
    const site = await createProject(cookie);
    await sendNote(site.publicKey, "First", "203.0.113.21");
    expect(await runInstantEmails(env, await later(), recorder().send, NO_GAP)).toBe(1);

    await sendNote(site.publicKey, "Second", "203.0.113.22");
    await sendNote(site.publicKey, "Third", "203.0.113.23");
    // Too soon after the last email: they wait.
    expect(await runInstantEmails(env, await later(), recorder().send, SHORT_GAP)).toBe(0);
    // Once the gap has passed: both, in one email.
    await new Promise((resolve) => setTimeout(resolve, SHORT_GAP + 20));
    const after = recorder();
    expect(await runInstantEmails(env, await later(), after.send, SHORT_GAP)).toBe(1);
    expect(after.sent[0]?.subject).toBe("2 new notes on Test site");
    expect(after.sent[0]?.text).toContain("2 new notes in the last few minutes.");
  });

  it("starts straight away after switching to it, without waiting out a gap", async () => {
    const cookie = await loginAsDev();
    await choose(cookie, "off");
    await choose(cookie, "instant");
    const site = await createProject(cookie);
    await sendNote(site.publicKey, "Right after switching", "203.0.113.26");
    // The real gap: switching moves "emailed up to", not "last emailed".
    await env.DB.prepare("UPDATE users SET emailed_at = NULL").run();
    expect(await runInstantEmails(env, await later(), recorder().send)).toBe(1);
  });

  it("leaves out notes already read, and people who chose something else", async () => {
    const cookie = await loginAsDev();
    await choose(cookie, "instant");
    const site = await createProject(cookie);
    await sendNote(site.publicKey, "Read already", "203.0.113.24");
    await env.DB.prepare(
      "UPDATE feedback SET status = 'seen' WHERE message = 'Read already'",
    ).run();
    expect(await runInstantEmails(env, await later(), recorder().send, NO_GAP)).toBe(0);

    await choose(cookie, "daily");
    await sendNote(site.publicKey, "For the digest", "203.0.113.25");
    expect(await runInstantEmails(env, await later(), recorder().send, NO_GAP)).toBe(0);
  });
});

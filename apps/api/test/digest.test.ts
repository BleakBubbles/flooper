import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { type Email, runDigests } from "../src/digest";
import { createProject, json, loginAsDev, request, SITE, submission } from "./helpers";

async function me(cookie: string) {
  const res = await request("/api/v1/me", { headers: { Cookie: cookie } });
  return (await res.json()) as { email: string | null; digestEnabled: boolean };
}

async function turnOn(cookie: string, email = "owner@example.com") {
  return json(
    "PUT",
    "/api/v1/me/notifications",
    { email, digestEnabled: true },
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
    expect(await me(cookie)).toMatchObject({ email: "dev@example.com", digestEnabled: false });

    const noEmail = await json(
      "PUT",
      "/api/v1/me/notifications",
      { email: null, digestEnabled: true },
      { Cookie: cookie },
    );
    expect(noEmail.status).toBe(422);

    const res = await turnOn(cookie);
    expect(res.status).toBe(200);
    expect(await me(cookie)).toMatchObject({ email: "owner@example.com", digestEnabled: true });
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
    expect((await me(cookie)).digestEnabled).toBe(false);
  });

  it("supports mail apps' one-click POST, and gives nothing away for unknown tokens", async () => {
    const cookie = await loginAsDev();
    await turnOn(cookie);
    const token = await unsubscribeToken();

    const unknown = await request("/api/unsubscribe/not-a-real-token", { method: "POST" });
    expect(unknown.status).toBe(204);
    expect((await me(cookie)).digestEnabled).toBe(true);

    const oneClick = await request(`/api/unsubscribe/${token}`, { method: "POST" });
    expect(oneClick.status).toBe(204);
    expect((await me(cookie)).digestEnabled).toBe(false);
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
      { email: "owner@example.com", digestEnabled: false },
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

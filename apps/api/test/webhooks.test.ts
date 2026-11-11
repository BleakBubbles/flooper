import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { json, loginAsDev, request } from "./helpers";

/** Sign a body the way Resend (Svix) does, with the test secret. */
async function sign(body: string, id = "msg_1", at = Math.floor(Date.now() / 1000)) {
  const secret = (env as unknown as { RESEND_WEBHOOK_SECRET: string }).RESEND_WEBHOOK_SECRET;
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${at}.${body}`),
  );
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return { "svix-id": id, "svix-timestamp": String(at), "svix-signature": `v1,${b64}` };
}

async function post(event: unknown, headers?: Record<string, string>) {
  const body = JSON.stringify(event);
  return request("/api/webhooks/resend", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json", ...(headers ?? (await sign(body))) },
  });
}

async function digestOn(email = "owner@example.com"): Promise<boolean> {
  const row = await env.DB.prepare("SELECT note_emails FROM users WHERE email = ?")
    .bind(email)
    .first<{ note_emails: string }>();
  return row?.note_emails !== "off";
}

async function turnOn(email: string) {
  const cookie = await loginAsDev();
  const res = await json(
    "PUT",
    "/api/v1/me/notifications",
    { email, noteEmails: "daily" },
    { Cookie: cookie },
  );
  expect(res.status).toBe(200);
}

describe("Resend webhook", () => {
  it("switches the digest off when it bounces or is marked as spam", async () => {
    await turnOn("owner@example.com");
    // Something else happening to an email changes nothing.
    expect(
      (await post({ type: "email.delivered", data: { to: ["owner@example.com"] } })).status,
    ).toBe(204);
    expect(await digestOn()).toBe(true);

    expect(
      (await post({ type: "email.bounced", data: { to: ["OWNER@example.com"] } })).status,
    ).toBe(204);
    expect(await digestOn()).toBe(false);

    await turnOn("owner@example.com");
    await post({ type: "email.complained", data: { to: ["owner@example.com"] } });
    expect(await digestOn()).toBe(false);
  });

  it("ignores calls it can't trust: unsigned, forged, or stale", async () => {
    await turnOn("owner@example.com");
    const event = { type: "email.bounced", data: { to: ["owner@example.com"] } };
    const body = JSON.stringify(event);

    expect((await post(event, { "svix-id": "msg_1" })).status).toBe(401);
    const forged = await sign(JSON.stringify({ ...event, data: { to: ["someone@else.com"] } }));
    expect((await post(event, forged)).status).toBe(401);
    const stale = await sign(body, "msg_2", Math.floor(Date.now() / 1000) - 60 * 60);
    expect((await post(event, stale)).status).toBe(401);

    expect(await digestOn()).toBe(true);
  });
});

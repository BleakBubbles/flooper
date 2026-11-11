import { Hono } from "hono";
import type { AppEnv } from "../env";
import { log } from "../lib/log";

/**
 * Resend tells us when a digest bounced (the address is gone) or was marked
 * as spam. Either way, that person's digest goes off: emailing dead addresses
 * or people who complained hurts flooper.app's standing with mail providers.
 *
 * Resend signs each call the Svix way (see verifySvix). Without the secret
 * set, or with a bad or stale signature, nothing changes.
 */
export const webhooks = new Hono<AppEnv>();

/** Events that switch the digest off. Others (delivered, opened...) are ignored. */
const STOPS = new Set(["email.bounced", "email.complained"]);

webhooks.post("/resend", async (c) => {
  const secret = c.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: "not configured" }, 503);

  const body = await c.req.text();
  const ok = await verifySvix(secret, body, {
    id: c.req.header("svix-id"),
    timestamp: c.req.header("svix-timestamp"),
    signature: c.req.header("svix-signature"),
  });
  if (!ok) return c.json({ error: "bad signature" }, 401);

  const event = JSON.parse(body) as { type?: string; data?: { to?: string[] | string } };
  if (!event.type || !STOPS.has(event.type)) return c.body(null, 204);

  const to = Array.isArray(event.data?.to) ? event.data.to : [event.data?.to];
  const emails = to.filter((e): e is string => typeof e === "string").map((e) => e.toLowerCase());
  if (emails.length === 0) return c.body(null, 204);

  const result = await c.env.DB.prepare(
    `UPDATE users SET digest_enabled = 0
     WHERE digest_enabled = 1 AND lower(email) IN (SELECT value FROM json_each(?))`,
  )
    .bind(JSON.stringify(emails))
    .run();
  log("info", "digest switched off by Resend", {
    event: event.type,
    users: result.meta.changes ?? 0,
  });
  return c.body(null, 204);
});

/** How far a webhook's timestamp may be from now, either way: replays older than this fail. */
const TOLERANCE_S = 5 * 60;

/**
 * Svix's signature scheme, which Resend uses: HMAC-SHA256 over
 * "{id}.{timestamp}.{body}" with the secret (base64 after its "whsec_"
 * prefix), sent as one or more space-separated "v1,{base64}" entries.
 */
export async function verifySvix(
  secret: string,
  body: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  now = Date.now(),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > TOLERANCE_S) return false;

  let key: CryptoKey;
  try {
    const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (ch) => ch.charCodeAt(0));
    key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [
      "verify",
    ]);
  } catch {
    return false;
  }
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  for (const entry of signature.split(" ")) {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) continue;
    let given: Uint8Array;
    try {
      given = Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));
    } catch {
      continue;
    }
    // verify() compares in constant time.
    if (await crypto.subtle.verify("HMAC", key, given, signed)) return true;
  }
  return false;
}

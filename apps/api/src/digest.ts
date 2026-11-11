import type { Reaction } from "@flooper/shared";
import type { Bindings } from "./env";
import { log } from "./lib/log";

// Emails about new notes, grouped by site. Each user picks one kind (or none):
//
// - daily: once a day (13:00 UTC), the notes since the last one. Days without
//   new notes send nothing.
// - instant: a run every minute emails the notes that just arrived. Several
//   close together come in one email, and there's at least INSTANT_GAP_MS
//   between two, so a busy hour can't flood anyone's inbox (or Resend's quota).
//
// Both runs are cron triggers (see `triggers` in wrangler.jsonc).

/** Which email: the daily digest, or one as notes arrive. */
export type NoteEmailKind = "daily" | "instant";

/** One email, ready to send. */
export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** For the List-Unsubscribe headers (one-click unsubscribe in mail apps). */
  unsubscribeUrl?: string;
  /** Instead of EMAIL_FROM. */
  from?: string;
  /** Instead of REPLY_TO. */
  replyTo?: string;
}

/** Sends one email; true if the provider accepted it. Injectable for tests. */
export type Sender = (email: Email) => Promise<boolean>;

interface DigestUser {
  id: string;
  email: string;
  unsubscribe_token: string;
  digest_sent_at: number | null;
}

interface DigestNote {
  site_id: string;
  site_name: string;
  reaction: Reaction | null;
  message: string | null;
  page_url: string;
}

/** How far back a first (or long-delayed) digest looks. */
const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** How far back an instant email looks, if one was missed (say, Resend was down). */
const INSTANT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** The least time between two instant emails to one person; notes in between wait. */
export const INSTANT_GAP_MS = 5 * 60 * 1000;
/** Notes listed per site; the rest are counted. */
const NOTES_PER_SITE = 5;
/** Users per run: Resend's free plan sends 100 a day. Raise with the plan. */
const USERS_PER_RUN = 100;

const EMOJI: Record<Reaction, string> = { love: "❤️", idea: "💡", confused: "🤔", bug: "🐛" };

/** Send everyone who chose the daily digest theirs. */
export async function runDigests(env: Bindings, now: number, send: Sender): Promise<number> {
  const { results: users } = await env.DB.prepare(
    `SELECT id, email, unsubscribe_token, digest_sent_at FROM users
     WHERE note_emails = 'daily' AND email IS NOT NULL AND unsubscribe_token IS NOT NULL
     ORDER BY digest_sent_at ASC NULLS FIRST LIMIT ?`,
  )
    .bind(USERS_PER_RUN)
    .all<DigestUser>();
  return emailNotes(env, now, send, users, "daily");
}

/**
 * Every minute: email the notes that just arrived, to everyone who chose
 * "as notes arrive" and has new ones, unless they had one in the last
 * INSTANT_GAP_MS (those notes wait for the next email).
 */
export async function runInstantEmails(
  env: Bindings,
  now: number,
  send: Sender,
  /** Shorter in tests. */
  gap = INSTANT_GAP_MS,
): Promise<number> {
  const { results: users } = await env.DB.prepare(
    `SELECT u.id, u.email, u.unsubscribe_token, u.digest_sent_at FROM users u
     WHERE u.note_emails = 'instant' AND u.email IS NOT NULL AND u.unsubscribe_token IS NOT NULL
       AND (u.emailed_at IS NULL OR u.emailed_at <= ?1)
       AND EXISTS (
         SELECT 1 FROM feedback f JOIN projects p ON p.id = f.project_id
         WHERE p.owner_id = u.id AND f.status = 'new' AND f.deleted_at IS NULL
           AND f.created_at > COALESCE(u.digest_sent_at, ?2) AND f.created_at <= ?3)
     ORDER BY u.emailed_at ASC NULLS FIRST LIMIT ?4`,
  )
    .bind(now - gap, now - INSTANT_LOOKBACK_MS, now, USERS_PER_RUN)
    .all<DigestUser>();
  if (users.length === 0) return 0;
  return emailNotes(env, now, send, users, "instant");
}

/**
 * Email each of these users their unread notes since their last email. Each
 * user's "last sent" time only moves when their email is accepted, so a failed
 * send is retried by the next run (and covers everything since the last one
 * that worked).
 */
async function emailNotes(
  env: Bindings,
  now: number,
  send: Sender,
  users: DigestUser[],
  kind: NoteEmailKind,
): Promise<number> {
  const lookback = kind === "daily" ? MAX_LOOKBACK_MS : INSTANT_LOOKBACK_MS;
  let sent = 0;
  for (const user of users) {
    const since = Math.max(user.digest_sent_at ?? 0, now - lookback);
    const { results: notes } = await env.DB.prepare(
      `SELECT p.id AS site_id, p.name AS site_name, f.reaction, f.message, f.page_url
       FROM feedback f JOIN projects p ON p.id = f.project_id
       WHERE p.owner_id = ? AND f.status = 'new' AND f.deleted_at IS NULL
         AND f.created_at > ? AND f.created_at <= ?
       ORDER BY p.created_at, f.created_at DESC`,
    )
      .bind(user.id, since, now)
      .all<DigestNote>();

    if (notes.length > 0) {
      const email = buildDigest(user.email, notes, publicUrl(env), user.unsubscribe_token, kind);
      const ok = await send(email).catch((err: unknown) => {
        log("error", "note email failed", { userId: user.id, kind, error: String(err) });
        return false;
      });
      if (!ok) continue;
      sent++;
    }
    // Covered up to now; and if an email went out, the gap counts from now.
    await env.DB.prepare(
      `UPDATE users SET digest_sent_at = ?1,
         emailed_at = CASE WHEN ?2 = 1 THEN ?1 ELSE emailed_at END
       WHERE id = ?3`,
    )
      .bind(now, notes.length > 0 ? 1 : 0, user.id)
      .run();
  }
  log("info", "note emails sent", { kind, users: users.length, sent });
  return sent;
}

/** The app's public address, for links in emails (no trailing slash). */
function publicUrl(env: Bindings): string {
  return env.PUBLIC_URL.replace(/\/+$/, "");
}

/** One user's email: a subject, then each site with its newest notes. */
export function buildDigest(
  to: string,
  notes: DigestNote[],
  base: string,
  unsubscribeToken: string,
  kind: NoteEmailKind = "daily",
): Email {
  const sites = new Map<string, { name: string; notes: DigestNote[] }>();
  for (const note of notes) {
    const site = sites.get(note.site_id) ?? { name: note.site_name, notes: [] };
    site.notes.push(note);
    sites.set(note.site_id, site);
  }

  const count = notes.length;
  const plural = count === 1 ? "note" : "notes";
  const siteNames = [...sites.values()].map((s) => s.name);
  const where = siteNames.length === 1 ? siteNames[0] : `${siteNames.length} sites`;
  const first = notes[0];
  // An instant email about one note says what it is, so the subject alone
  // tells you whether to look now.
  const subject =
    kind === "instant" && count === 1 && first
      ? `New note on ${where}: ${shorten(summary(first), 60)}`
      : `${count} new ${plural} on ${where}`;
  const unsubscribeUrl = `${base}/api/unsubscribe/${unsubscribeToken}`;
  const lead =
    kind === "daily"
      ? `${count} new ${plural} since your last digest.`
      : count === 1
        ? `A new note on ${where}.`
        : `${count} new notes in the last few minutes.`;
  const why =
    kind === "daily"
      ? "You get this because you turned on the daily digest in Flooper."
      : "You get this because you asked Flooper to email you as notes arrive.";

  const text: string[] = [lead, ""];
  const html: string[] = [`<p style="margin:0 0 20px;font-size:16px">${escapeHtml(lead)}</p>`];
  for (const [id, site] of sites) {
    const link = `${base}/?site=${encodeURIComponent(id)}`;
    const shown = site.notes.slice(0, NOTES_PER_SITE);
    const more = site.notes.length - shown.length;
    text.push(`${site.name} (${site.notes.length})`);
    html.push(
      `<h2 style="margin:24px 0 8px;font-size:16px"><a href="${escapeHtml(link)}" style="color:#1a1a1a">${escapeHtml(site.name)}</a> <span style="color:#8b8b85;font-weight:400">${site.notes.length}</span></h2>`,
      `<ul style="margin:0;padding:0;list-style:none">`,
    );
    for (const note of shown) {
      const line = `${note.reaction ? `${EMOJI[note.reaction]} ` : ""}${summary(note)}`;
      text.push(`  ${line}`);
      html.push(
        `<li style="margin:0 0 6px">${escapeHtml(line)} <span style="color:#8b8b85">${escapeHtml(pathOf(note.page_url))}</span></li>`,
      );
    }
    if (more > 0) {
      text.push(`  and ${more} more`);
      html.push(`<li style="color:#8b8b85">and ${more} more</li>`);
    }
    html.push("</ul>");
    text.push(`  ${link}`, "");
  }
  text.push("", `Unsubscribe: ${unsubscribeUrl}`);
  html.push(
    `<p style="margin:32px 0 0;font-size:13px;color:#8b8b85">${escapeHtml(why)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8b8b85">Unsubscribe</a></p>`,
  );

  return {
    to,
    subject,
    text: text.join("\n"),
    html: `<div style="font:15px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif;color:#1a1a1a;max-width:560px">${html.join("\n")}</div>`,
    unsubscribeUrl,
  };
}

/** The note's message, shortened; or its page when it has no message. */
function summary(note: DigestNote): string {
  const message = (note.message ?? "").replace(/\s+/g, " ").trim();
  if (!message) return "(no message)";
  return shorten(message, 140);
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

/** Notes are written by strangers: everything put in the email's HTML is escaped. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sends through Resend (https://resend.com). Without RESEND_API_KEY (local
 * development), the email is logged instead of sent.
 */
export function resendSender(env: Bindings): Sender {
  return async (email) => {
    if (!env.RESEND_API_KEY) {
      log("info", "email (not sent: no RESEND_API_KEY)", {
        to: email.to,
        subject: email.subject,
        text: email.text,
      });
      return true;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: email.from ?? env.EMAIL_FROM,
        // Replies reach a person (hello@, or the site's owner), not the
        // automated sender.
        ...((email.replyTo ?? env.REPLY_TO) ? { reply_to: email.replyTo ?? env.REPLY_TO } : {}),
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.unsubscribeUrl && {
          headers: {
            "List-Unsubscribe": `<${email.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
      }),
    });
    if (!res.ok) {
      log("error", "resend refused an email", { status: res.status, body: await res.text() });
    }
    return res.ok;
  };
}

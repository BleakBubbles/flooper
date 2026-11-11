import { defaultReplyMessage, noteHost, type Reaction } from "@flooper/shared";
import { type Email, escapeHtml } from "./digest";

// "Let them know?": the one email a visitor gets about a note they asked to
// hear back about. It comes from Flooper's address under the website's own
// address (the visitor never saw the site's name in Flooper, which is just
// the owner's label), and replies go straight to the site's owner.

export interface ReplyInput {
  /** The visitor's address, from "Want to hear back about this?". */
  to: string;
  /** The page the note was left on: its host names the website to the visitor. */
  pageUrl: string;
  /** Whether the note is done, and its reaction, for the default message. */
  done: boolean;
  reaction?: Reaction | null;
  /** The owner's address, for Reply-To. */
  ownerEmail: string;
  /** EMAIL_FROM, e.g. `Flooper <notes@flooper.app>`: only its address is used. */
  from: string;
  /** What the visitor wrote, quoted under the reply. */
  note: string | null;
  /** The owner's own words; a short default when they leave it empty. */
  message?: string;
}

export function buildReplyEmail(input: ReplyInput): Email {
  const host = noteHost(input.pageUrl);
  const message = input.message?.trim() || defaultReplyMessage(host, input.done, input.reaction);
  const note = input.note?.trim();

  const text = [message, ""];
  const html = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
  if (note) {
    text.push("Your note:", ...note.split("\n").map((line) => `> ${line}`), "");
    html.push(
      `<p style="margin:20px 0 6px;font-size:13px;color:#8b8b85">Your note</p>`,
      `<blockquote style="margin:0;padding:2px 0 2px 12px;border-left:3px solid #e3e3de;color:#3d3d39">${escapeHtml(note).replace(/\n/g, "<br>")}</blockquote>`,
    );
  }
  const footer = `You're getting this because you asked to hear back about your note on ${host}. Reply to this email to answer the site's owner.`;
  text.push(footer);
  html.push(
    `<p style="margin:28px 0 0;font-size:13px;color:#8b8b85">${escapeHtml(footer)} Sent with <a href="https://flooper.app" style="color:#8b8b85">Flooper</a>.</p>`,
  );

  return {
    to: input.to,
    from: `"${displayName(host)} via Flooper" <${address(input.from)}>`,
    replyTo: input.ownerEmail,
    subject: `About your note on ${host}`,
    text: text.join("\n"),
    html: `<div style="font:15px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif;color:#1a1a1a;max-width:560px">${html.join("\n")}</div>`,
  };
}

/** Safe inside a quoted From name: no quotes, brackets or line breaks. */
function displayName(name: string): string {
  return name.replace(/["\\<>\r\n]/g, "").trim() || "A site";
}

/** The bare address from `Name <address>` (or the whole thing if it's bare already). */
function address(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
}

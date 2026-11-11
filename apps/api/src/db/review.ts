import type { FeedbackStatus, Reaction } from "@flooper/shared";
import type { ReviewElement, ReviewNote, ReviewPage } from "@flooper/shared/schemas";
import { randomToken, sha256Hex } from "../lib/crypto";
import type { ProjectRow } from "./projects";

// Review mode: the owner opens their own site with a short-lived token in the
// URL fragment, and the widget there asks for the page's notes, grouped by the
// element each points at, to draw them over the page.

/** How long a review link works. Long enough for a session of going through notes. */
export const REVIEW_TTL_MS = 4 * 60 * 60 * 1000;
/** The most notes one page returns, newest first. */
export const REVIEW_NOTES_MAX = 500;

/**
 * Make a review link's token for one site. Only its hash is stored. Expired
 * ones go as new ones are made, so the table stays small without a cron job.
 */
export async function createReviewToken(
  db: D1Database,
  projectId: string,
  now = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const token = randomToken();
  const expiresAt = now + REVIEW_TTL_MS;
  await db.batch([
    db.prepare("DELETE FROM review_tokens WHERE expires_at <= ?").bind(now),
    db
      .prepare(
        "INSERT INTO review_tokens (token_hash, project_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      )
      .bind(await sha256Hex(token), projectId, now, expiresAt),
  ]);
  return { token, expiresAt };
}

/** The site a review token opens, if it's that site's (by its public key) and still valid. */
export async function projectForReviewToken(
  db: D1Database,
  token: string,
  publicKey: string,
  now = Date.now(),
): Promise<ProjectRow | null> {
  return db
    .prepare(
      `SELECT projects.* FROM review_tokens
       JOIN projects ON projects.id = review_tokens.project_id
       WHERE review_tokens.token_hash = ? AND review_tokens.expires_at > ?
         AND projects.public_key = ?`,
    )
    .bind(await sha256Hex(token), now, publicKey)
    .first<ProjectRow>();
}

interface ReviewRow {
  id: string;
  reaction: Reaction | null;
  message: string | null;
  status: FeedbackStatus;
  created_at: number;
  target: string | null;
}

/**
 * One page's notes for the overlay: grouped by the element they point at,
 * busiest first, plus those that point at nothing. Archived and deleted notes
 * are left out. Only what the overlay draws: no visitor details, addresses or
 * browsers, since it's shown on the live site.
 */
export async function reviewPage(
  db: D1Database,
  projectId: string,
  path: string,
): Promise<ReviewPage> {
  const { results } = await db
    .prepare(
      `SELECT id, reaction, message, status, created_at, target FROM feedback
       WHERE project_id = ? AND deleted_at IS NULL AND status <> 'archived'
         AND json_extract(context, '$.path') = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(projectId, path, REVIEW_NOTES_MAX + 1)
    .all<ReviewRow>();

  const rows = results.slice(0, REVIEW_NOTES_MAX);
  const elements = new Map<string, ReviewElement>();
  const unpinned: ReviewNote[] = [];
  for (const row of rows) {
    const note: ReviewNote = {
      id: row.id,
      reaction: row.reaction,
      message: row.message,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    };
    const target = row.target
      ? (JSON.parse(row.target) as { selector: string; text?: string })
      : null;
    if (!target) {
      unpinned.push(note);
      continue;
    }
    const element = elements.get(target.selector) ?? {
      selector: target.selector,
      text: target.text ?? null,
      total: 0,
      counts: { love: 0, idea: 0, confused: 0, bug: 0, none: 0 },
      notes: [],
    };
    element.total++;
    element.counts[row.reaction ?? "none"]++;
    element.notes.push(note);
    elements.set(target.selector, element);
  }

  return {
    path,
    elements: [...elements.values()].sort((a, b) => b.total - a.total),
    unpinned,
    truncated: results.length > REVIEW_NOTES_MAX,
  };
}

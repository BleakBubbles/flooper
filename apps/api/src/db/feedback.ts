import type { FeedbackCounts, FeedbackStatus, Reaction } from "@flooper/shared";
import type { Feedback, FeedbackSubmission, ProjectSummary } from "@flooper/shared/schemas";
import type { Cursor } from "../lib/cursor";
import { newId } from "../lib/ids";

export interface FeedbackRow {
  id: string;
  project_id: string;
  status: FeedbackStatus;
  reaction: Feedback["reaction"];
  message: string | null;
  page_url: string;
  context: string;
  target: string | null;
  visitor: string | null;
  metadata: string | null;
  idempotency_key: string;
  created_at: number;
}

/**
 * Store a submission. If one with the same idempotency key already exists for
 * this project (a retry after a flaky network, say), return the existing ID
 * instead of creating a duplicate.
 */
export async function insertFeedback(
  db: D1Database,
  projectId: string,
  submission: FeedbackSubmission,
): Promise<{ id: string; duplicate: boolean }> {
  const inserted = await db
    .prepare(
      `INSERT INTO feedback
         (id, project_id, reaction, message, page_url, context, target, visitor, metadata,
          idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (project_id, idempotency_key) DO NOTHING
       RETURNING id`,
    )
    .bind(
      newId("feedback"),
      projectId,
      submission.reaction ?? null,
      submission.message || null,
      submission.context.url,
      JSON.stringify(submission.context),
      jsonOrNull(submission.target),
      jsonOrNull(submission.visitor),
      jsonOrNull(submission.metadata),
      submission.idempotencyKey,
      Date.now(),
    )
    .first<{ id: string }>();
  if (inserted) return { id: inserted.id, duplicate: false };

  const existing = await db
    .prepare("SELECT id FROM feedback WHERE project_id = ? AND idempotency_key = ?")
    .bind(projectId, submission.idempotencyKey)
    .first<{ id: string }>();
  if (!existing) throw new Error("Conflicting feedback row vanished");
  return { id: existing.id, duplicate: true };
}

/** How many notes the project has in each status. One grouped query, not four. */
export async function countFeedback(db: D1Database, projectId: string): Promise<FeedbackCounts> {
  const { results } = await db
    .prepare("SELECT status, COUNT(*) AS n FROM feedback WHERE project_id = ? GROUP BY status")
    .bind(projectId)
    .all<{ status: FeedbackStatus; n: number }>();
  const counts: FeedbackCounts = { new: 0, seen: 0, done: 0, archived: 0, total: 0, latest: null };
  for (const { status, n } of results) {
    counts[status] = n;
    counts.total += n;
  }
  if (counts.total > 0) {
    // Served by the (project_id, created_at) index, so this is one row read.
    const latest = await db
      .prepare(
        "SELECT created_at, page_url FROM feedback WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .bind(projectId)
      .first<{ created_at: number; page_url: string }>();
    if (latest) {
      counts.latest = {
        createdAt: new Date(latest.created_at).toISOString(),
        pageUrl: latest.page_url,
      };
    }
  }
  return counts;
}

/**
 * One site's notes (its inbox), or every note across an owner's sites (the
 * home screen). Newest first unless asked otherwise. Fetches one extra row to
 * learn whether there's a next page.
 */
export async function listFeedback(
  db: D1Database,
  scope: { projectId: string } | { ownerId: string },
  opts: { status?: FeedbackStatus; order?: "newest" | "oldest"; cursor?: Cursor; limit: number },
): Promise<{ rows: FeedbackRow[]; hasMore: boolean }> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if ("projectId" in scope) {
    where.push("project_id = ?");
    params.push(scope.projectId);
  } else {
    where.push("project_id IN (SELECT id FROM projects WHERE owner_id = ?)");
    params.push(scope.ownerId);
  }
  if (opts.status) {
    where.push("status = ?");
    params.push(opts.status);
  }
  const oldest = opts.order === "oldest";
  if (opts.cursor) {
    // "Strictly after the cursor" in the list's (created_at, id) order.
    const op = oldest ? ">" : "<";
    where.push(`(created_at ${op} ? OR (created_at = ? AND id ${op} ?))`);
    params.push(opts.cursor.createdAt, opts.cursor.createdAt, opts.cursor.id);
  }
  const dir = oldest ? "ASC" : "DESC";
  const { results } = await db
    .prepare(
      `SELECT * FROM feedback WHERE ${where.join(" AND ")}
       ORDER BY created_at ${dir}, id ${dir} LIMIT ?`,
    )
    .bind(...params, opts.limit + 1)
    .all<FeedbackRow>();
  return { rows: results.slice(0, opts.limit), hasMore: results.length > opts.limit };
}

const DAY = 24 * 60 * 60 * 1000;
export const ACTIVITY_DAYS = 14;

/**
 * Each of the owner's sites' summary, for the home screen's cards: two grouped
 * queries over all their sites at once, rather than a few per site. Sites with
 * no notes are missing from the map.
 */
export async function summarizeProjects(
  db: D1Database,
  ownerId: string,
  now = Date.now(),
): Promise<Map<string, ProjectSummary>> {
  const owned = "project_id IN (SELECT id FROM projects WHERE owner_id = ?)";
  // Days are 24-hour windows counting back from now, so no time zone is needed.
  const since = now - ACTIVITY_DAYS * DAY;
  const [counts, days] = await db.batch<Record<string, string | number | null>>([
    db
      .prepare(
        `SELECT project_id, status, reaction, COUNT(*) AS n, MAX(created_at) AS last
         FROM feedback WHERE ${owned} GROUP BY project_id, status, reaction`,
      )
      .bind(ownerId),
    db
      .prepare(
        `SELECT project_id, CAST((created_at - ?) / ${DAY} AS INTEGER) AS day, COUNT(*) AS n
         FROM feedback WHERE ${owned} AND created_at >= ? GROUP BY project_id, day`,
      )
      .bind(since, ownerId, since),
  ]);

  const summaries = new Map<string, ProjectSummary>();
  const get = (projectId: string) => {
    let s = summaries.get(projectId);
    if (!s) {
      s = emptySummary();
      summaries.set(projectId, s);
    }
    return s;
  };
  for (const row of counts?.results ?? []) {
    const s = get(row.project_id as string);
    const n = row.n as number;
    s.total += n;
    const last = new Date(row.last as number).toISOString();
    if (!s.lastNoteAt || last > s.lastNoteAt) s.lastNoteAt = last;
    if (row.status === "new") {
      s.newCount += n;
      const reaction = row.reaction as Reaction | null;
      if (reaction) s.newByReaction[reaction] = (s.newByReaction[reaction] ?? 0) + n;
    }
  }
  for (const row of days?.results ?? []) {
    const day = row.day as number;
    if (day >= 0 && day < ACTIVITY_DAYS)
      get(row.project_id as string).activity[day] = row.n as number;
  }
  return summaries;
}

/** A site with no notes yet. */
export function emptySummary(): ProjectSummary {
  return {
    newCount: 0,
    newByReaction: {},
    total: 0,
    lastNoteAt: null,
    activity: Array(ACTIVITY_DAYS).fill(0),
  };
}

/** One note, but only if it belongs to one of the owner's projects. */
export function getFeedbackForOwner(
  db: D1Database,
  id: string,
  ownerId: string,
): Promise<FeedbackRow | null> {
  return db
    .prepare(
      `SELECT * FROM feedback
       WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE owner_id = ?)`,
    )
    .bind(id, ownerId)
    .first<FeedbackRow>();
}

/** Update a feedback item's status, but only if it belongs to one of the owner's projects. */
export function updateFeedbackStatus(
  db: D1Database,
  id: string,
  ownerId: string,
  status: FeedbackStatus,
): Promise<FeedbackRow | null> {
  return db
    .prepare(
      `UPDATE feedback SET status = ?
       WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE owner_id = ?)
       RETURNING *`,
    )
    .bind(status, id, ownerId)
    .first<FeedbackRow>();
}

export function toFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    reaction: row.reaction,
    message: row.message,
    context: JSON.parse(row.context),
    target: parseOrNull(row.target),
    visitor: parseOrNull(row.visitor),
    metadata: parseOrNull(row.metadata),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const jsonOrNull = (value: unknown) => (value === undefined ? null : JSON.stringify(value));
const parseOrNull = (value: string | null) => (value === null ? null : JSON.parse(value));

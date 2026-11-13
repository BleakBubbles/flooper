import type { FeedbackCounts, FeedbackStatus, Reaction } from "@flooper/shared";
import type {
  Feedback,
  FeedbackSubmission,
  NoteSort,
  PageGroup,
  ProjectSummary,
} from "@flooper/shared/schemas";
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
  deleted_at: number | null;
  contact_email: string | null;
  replied_at: number | null;
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
/** How long after sending a note its visitor can still ask to hear back. */
export const REPLY_WINDOW_MS = 60 * 60 * 1000;

/**
 * Attach the visitor's address to the note they just sent. Only once, only
 * soon after sending, and only to a note on this site, so a note's ID (which
 * only its visitor's browser was given) can't be used to change it later.
 * Returns whether a note took it.
 */
export async function setContactEmail(
  db: D1Database,
  projectId: string,
  id: string,
  email: string,
  now = Date.now(),
): Promise<boolean> {
  const updated = await db
    .prepare(
      `UPDATE feedback SET contact_email = ?
       WHERE id = ? AND project_id = ? AND contact_email IS NULL
         AND deleted_at IS NULL AND created_at > ?
       RETURNING id`,
    )
    .bind(email, id, projectId, now - REPLY_WINDOW_MS)
    .first<{ id: string }>();
  return updated !== null;
}

/**
 * How many notes a site has had since `since` (deleted ones too: they still
 * came in). For the daily cap: a read on the (project_id, created_at) index
 * instead of a counter written on every note. Stops counting past `atMost`.
 */
export async function countNotesSince(
  db: D1Database,
  projectId: string,
  since: number,
  atMost: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT 1 FROM feedback WHERE project_id = ? AND created_at >= ? LIMIT ?
       )`,
    )
    .bind(projectId, since, atMost)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function countFeedback(db: D1Database, projectId: string): Promise<FeedbackCounts> {
  // From the running counts (migration 0011), not by counting notes.
  const { results } = await db
    .prepare(
      `SELECT status, SUM(n) AS n FROM site_counts
       WHERE project_id = ? AND deleted = 0 AND n > 0 GROUP BY status`,
    )
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
        "SELECT created_at, page_url FROM feedback WHERE project_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
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
 * What each sort orders by, besides time. Ties go newest first whichever way
 * the column runs (all the bugs, newest bug first), then by id, so the order
 * is always total and pages never overlap.
 */
const SORT_KEYS: Record<Exclude<NoteSort, "time">, string> = {
  site: "lower(p.name)",
  // Bugs first, then ideas, questions, love, and notes without a reaction.
  reaction: `CASE f.reaction WHEN 'bug' THEN 0 WHEN 'idea' THEN 1 WHEN 'confused' THEN 2
               WHEN 'love' THEN 3 ELSE 4 END`,
  page: "f.page_url",
  note: "lower(coalesce(f.message, ''))",
};

export type SortedFeedbackRow = FeedbackRow & { sort_key?: string | number };

/**
 * One site's notes, or every note across an owner's sites (the home screen).
 * Newest first unless asked otherwise. Fetches one extra row to learn whether
 * there's a next page.
 */
export async function listFeedback(
  db: D1Database,
  scope: { projectId: string } | { ownerId: string; projectId?: string },
  opts: {
    status?: FeedbackStatus;
    /** Just the notes left on this page path. */
    page?: string;
    /** Search: the message, the page or the picked element's text contains this. */
    q?: string;
    /** The deleted notes ("Recently deleted") instead of the others. */
    deleted?: boolean;
    /** Leave archived notes out when no status is asked for. */
    hideArchived?: boolean;
    sort?: NoteSort;
    dir?: "asc" | "desc";
    cursor?: Cursor;
    limit: number;
  },
): Promise<{ rows: SortedFeedbackRow[]; hasMore: boolean }> {
  // Deleted notes only show in "Recently deleted", whatever their status.
  const where: string[] = [opts.deleted ? "f.deleted_at IS NOT NULL" : "f.deleted_at IS NULL"];
  const params: (string | number)[] = [];
  if ("ownerId" in scope) {
    where.push("p.owner_id = ?");
    params.push(scope.ownerId);
  }
  if (scope.projectId) {
    where.push("f.project_id = ?");
    params.push(scope.projectId);
  }
  if (opts.page !== undefined) {
    where.push(`${PAGE_PATH} = ?`);
    params.push(opts.page);
  }
  if (opts.q) {
    // A plain substring, not a pattern: % and _ in what was typed are literal.
    const like = `%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      `(f.message LIKE ? ESCAPE '\\' OR ${PAGE_PATH} LIKE ? ESCAPE '\\'
        OR json_extract(f.target, '$.text') LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like);
  }
  if (opts.deleted) {
    // Every deleted note, whatever its status.
  } else if (opts.status) {
    where.push("f.status = ?");
    params.push(opts.status);
  } else if (opts.hideArchived) {
    where.push("f.status != 'archived'");
  }

  const dir = opts.dir === "asc" ? "ASC" : "DESC";
  const op = opts.dir === "asc" ? ">" : "<";
  const key = !opts.sort || opts.sort === "time" ? null : SORT_KEYS[opts.sort];
  if (opts.cursor) {
    // "Strictly after the cursor" in the list's order.
    if (key && opts.cursor.key !== undefined) {
      where.push(`(${key} ${op} ? OR (${key} = ? AND (f.created_at, f.id) < (?, ?)))`);
      params.push(opts.cursor.key, opts.cursor.key, opts.cursor.createdAt, opts.cursor.id);
    } else {
      where.push(`(f.created_at, f.id) ${op} (?, ?)`);
      params.push(opts.cursor.createdAt, opts.cursor.id);
    }
  }
  const order = key
    ? `sort_key ${dir}, f.created_at DESC, f.id DESC`
    : `f.created_at ${dir}, f.id ${dir}`;
  const { results } = await db
    .prepare(
      `SELECT f.*${key ? `, ${key} AS sort_key` : ""}
       FROM feedback f JOIN projects p ON p.id = f.project_id
       WHERE ${where.join(" AND ")}
       ORDER BY ${order} LIMIT ?`,
    )
    .bind(...params, opts.limit + 1)
    .all<SortedFeedbackRow>();
  return { rows: results.slice(0, opts.limit), hasMore: results.length > opts.limit };
}

/** A note's page path. Kept in its context, as the widget sent it. */
const PAGE_PATH = "json_extract(f.context, '$.path')";
/** Pages listed at most, busiest first. */
export const PAGES_MAX = 200;
/** Notes shown under each page; the rest load by picking the page. */
export const NOTES_PER_PAGE = 3;

/**
 * The notes list grouped by page, busiest page first (then most recent):
 * every one of the owner's sites, or just `projectId`. Each page has its
 * counts and its newest few notes. Two queries in one batch. Like the list,
 * `status` narrows everything, and archived notes are left out unless asked for.
 */
export async function listPageGroups(
  db: D1Database,
  ownerId: string,
  opts: { projectId?: string; status?: FeedbackStatus } = {},
): Promise<PageGroup[]> {
  const where = ["p.owner_id = ?", "f.deleted_at IS NULL"];
  const params: string[] = [ownerId];
  if (opts.projectId) {
    where.push("f.project_id = ?");
    params.push(opts.projectId);
  }
  if (opts.status) {
    where.push("f.status = ?");
    params.push(opts.status);
  } else {
    where.push("f.status != 'archived'");
  }
  const from = `FROM feedback f JOIN projects p ON p.id = f.project_id WHERE ${where.join(" AND ")}`;
  const [counts, newest] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT f.project_id, ${PAGE_PATH} AS path, f.status, f.reaction,
                COUNT(*) AS n, MAX(f.created_at) AS last
         ${from}
         GROUP BY f.project_id, path, f.status, f.reaction`,
      )
      .bind(...params),
    db
      .prepare(
        `SELECT * FROM (
           SELECT f.*, ${PAGE_PATH} AS path, ROW_NUMBER() OVER (
             PARTITION BY f.project_id, ${PAGE_PATH} ORDER BY f.created_at DESC, f.id DESC
           ) AS nth
           ${from}
         ) WHERE nth <= ${NOTES_PER_PAGE}
         ORDER BY created_at DESC, id DESC`,
      )
      .bind(...params),
  ]);
  const results = (counts?.results ?? []) as unknown as {
    project_id: string;
    path: string | null;
    status: FeedbackStatus;
    reaction: Reaction | null;
    n: number;
    last: number;
  }[];

  const pages = new Map<string, PageGroup & { last: number }>();
  for (const row of results) {
    const path = row.path ?? "/";
    const id = `${row.project_id} ${path}`;
    let page = pages.get(id);
    if (!page) {
      page = {
        projectId: row.project_id,
        path,
        total: 0,
        newCount: 0,
        byReaction: {},
        lastNoteAt: "",
        notes: [],
        last: 0,
      };
      pages.set(id, page);
    }
    page.total += row.n;
    if (row.status === "new") page.newCount += row.n;
    if (row.reaction) page.byReaction[row.reaction] = (page.byReaction[row.reaction] ?? 0) + row.n;
    page.last = Math.max(page.last, row.last);
  }
  for (const row of (newest?.results ?? []) as unknown as (FeedbackRow & {
    path: string | null;
  })[]) {
    pages.get(`${row.project_id} ${row.path ?? "/"}`)?.notes.push(toFeedback(row));
  }
  return [...pages.values()]
    .sort((a, b) => b.total - a.total || b.last - a.last)
    .slice(0, PAGES_MAX)
    .map(({ last, ...page }) => ({ ...page, lastNoteAt: new Date(last).toISOString() }));
}

const DAY = 24 * 60 * 60 * 1000;
export const ACTIVITY_DAYS = 14;

/**
 * Each of the owner's sites' summary, for the app's sidebar: three queries over
 * all their sites at once. None reads every note: the counts come from the
 * running counts (migration 0011), each site's latest note from the
 * (project_id, created_at) index, and the activity only from the last 14 days.
 * Sites with no notes are missing from the map.
 */
export async function summarizeProjects(
  db: D1Database,
  ownerId: string,
  now = Date.now(),
): Promise<Map<string, ProjectSummary>> {
  const owned = "project_id IN (SELECT id FROM projects WHERE owner_id = ?)";
  // Days are 24-hour windows counting back from now, so no time zone is needed.
  const since = now - ACTIVITY_DAYS * DAY;
  const [counts, lasts, days] = await db.batch<Record<string, string | number | null>>([
    db
      .prepare(
        `SELECT project_id, status, reaction, deleted AS gone, n
         FROM site_counts WHERE ${owned} AND n > 0`,
      )
      .bind(ownerId),
    // Each site's newest note that isn't deleted: the index, newest first,
    // stopping at the first one.
    db
      .prepare(
        `SELECT p.id AS project_id,
                (SELECT f.created_at FROM feedback f
                 WHERE f.project_id = p.id AND f.deleted_at IS NULL
                 ORDER BY f.created_at DESC LIMIT 1) AS last
         FROM projects p WHERE p.owner_id = ?`,
      )
      .bind(ownerId),
    db
      .prepare(
        `SELECT project_id, CAST((created_at - ?) / ${DAY} AS INTEGER) AS day, COUNT(*) AS n
         FROM feedback WHERE ${owned} AND created_at >= ? AND deleted_at IS NULL
         GROUP BY project_id, day`,
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
    if (row.gone) {
      s.deleted += n;
      continue;
    }
    s.total += n;
    if (row.status === "archived") s.archived += n;
    if (row.status === "done") s.done += n;
    if (row.status === "new") {
      s.newCount += n;
      // '' is a note with no reaction.
      const reaction = (row.reaction as Reaction | "") || null;
      if (reaction) s.newByReaction[reaction] = (s.newByReaction[reaction] ?? 0) + n;
    }
  }
  for (const row of lasts?.results ?? []) {
    if (row.last === null) continue;
    get(row.project_id as string).lastNoteAt = new Date(row.last as number).toISOString();
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
    done: 0,
    archived: 0,
    deleted: 0,
    lastNoteAt: null,
    activity: Array(ACTIVITY_DAYS).fill(0),
  };
}

/**
 * "Mark all as read": every new note across the owner's sites becomes seen,
 * or just one site's when `projectId` is given (and is theirs). Returns the
 * notes it changed, so the app can undo it.
 */
export async function markAllSeen(
  db: D1Database,
  ownerId: string,
  projectId?: string,
): Promise<string[]> {
  const oneSite = projectId ? " AND project_id = ?" : "";
  const { results } = await db
    .prepare(
      `UPDATE feedback SET status = 'seen'
       WHERE status = 'new' AND deleted_at IS NULL
         AND project_id IN (SELECT id FROM projects WHERE owner_id = ?)${oneSite}
       RETURNING id`,
    )
    .bind(...(projectId ? [ownerId, projectId] : [ownerId]))
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

// Counts of notes changed come from RETURNING, not D1's meta.changes, which
// also counts the rows the running-count triggers change (migration 0011).

/**
 * Several notes to one status at once, but only the owner's. The ids go in
 * as one JSON array, so there's no limit on bound parameters.
 */
export async function setStatuses(
  db: D1Database,
  ownerId: string,
  ids: string[],
  status: FeedbackStatus,
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE feedback SET status = ?
       WHERE id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL
         AND project_id IN (SELECT id FROM projects WHERE owner_id = ?)
       RETURNING id`,
    )
    .bind(status, JSON.stringify(ids), ownerId)
    .run();
  return result.results.length;
}

/** How long a deleted note stays in "Recently deleted". */
export const DELETED_KEPT_MS = 30 * DAY;

/**
 * Delete notes (into "Recently deleted"), or restore them (`at` null), but
 * only the owner's. Returns how many changed.
 */
export async function setDeleted(
  db: D1Database,
  ownerId: string,
  ids: string[],
  at: number | null,
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE feedback SET deleted_at = ?
       WHERE id IN (SELECT value FROM json_each(?))
         AND ${at === null ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"}
         AND project_id IN (SELECT id FROM projects WHERE owner_id = ?)
       RETURNING id`,
    )
    .bind(at, JSON.stringify(ids), ownerId)
    .run();
  return result.results.length;
}

/** "Delete forever": only notes already deleted, and only the owner's. */
export async function deleteForever(
  db: D1Database,
  ownerId: string,
  ids: string[],
): Promise<number> {
  const result = await db
    .prepare(
      `DELETE FROM feedback
       WHERE id IN (SELECT value FROM json_each(?)) AND deleted_at IS NOT NULL
         AND project_id IN (SELECT id FROM projects WHERE owner_id = ?)
       RETURNING id`,
    )
    .bind(JSON.stringify(ids), ownerId)
    .run();
  return result.results.length;
}

/** The daily job: notes deleted more than 30 days ago go for good. */
export async function purgeDeleted(db: D1Database, now = Date.now()): Promise<number> {
  const result = await db
    .prepare("DELETE FROM feedback WHERE deleted_at IS NOT NULL AND deleted_at < ? RETURNING id")
    .bind(now - DELETED_KEPT_MS)
    .run();
  return result.results.length;
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

/**
 * Claim a note's one reply: stamps replied_at if the visitor left an address
 * and nobody has replied yet. Returns the note, or null if it can't be
 * replied to (so two clicks can't send two emails).
 */
export function claimReply(
  db: D1Database,
  id: string,
  ownerId: string,
  now = Date.now(),
): Promise<FeedbackRow | null> {
  return db
    .prepare(
      `UPDATE feedback SET replied_at = ?
       WHERE id = ? AND contact_email IS NOT NULL AND replied_at IS NULL
         AND project_id IN (SELECT id FROM projects WHERE owner_id = ?)
       RETURNING *`,
    )
    .bind(now, id, ownerId)
    .first<FeedbackRow>();
}

/** The email didn't go out: free the note's reply for another try. */
export async function releaseReply(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE feedback SET replied_at = NULL WHERE id = ?").bind(id).run();
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
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at).toISOString(),
    contactEmail: row.contact_email ?? null,
    repliedAt: row.replied_at ? new Date(row.replied_at).toISOString() : null,
  };
}

const jsonOrNull = (value: unknown) => (value === undefined ? null : JSON.stringify(value));
const parseOrNull = (value: string | null) => (value === null ? null : JSON.parse(value));

import type { FeedbackStatus } from "@flooper/shared";
import type { Feedback, FeedbackSubmission } from "@flooper/shared/schemas";
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

/** Newest first. Fetches one extra row to learn whether there's a next page. */
export async function listFeedback(
  db: D1Database,
  projectId: string,
  opts: { status?: FeedbackStatus; cursor?: Cursor; limit: number },
): Promise<{ rows: FeedbackRow[]; hasMore: boolean }> {
  const where = ["project_id = ?"];
  const params: (string | number)[] = [projectId];
  if (opts.status) {
    where.push("status = ?");
    params.push(opts.status);
  }
  if (opts.cursor) {
    // "Strictly after the cursor" in (created_at DESC, id DESC) order.
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    params.push(opts.cursor.createdAt, opts.cursor.createdAt, opts.cursor.id);
  }
  const { results } = await db
    .prepare(
      `SELECT * FROM feedback WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(...params, opts.limit + 1)
    .all<FeedbackRow>();
  return { rows: results.slice(0, opts.limit), hasMore: results.length > opts.limit };
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

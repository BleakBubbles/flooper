import type { FeedbackRow } from "./feedback";

// "Export notes": every note on the owner's sites (or one site's), as a CSV
// that opens in Excel, Numbers or Google Sheets. Deleted notes are left out;
// archived and done ones are in, since an export should be complete.

/** Notes read from the database at a time, so a big export never sits in memory whole. */
const BATCH = 500;

const COLUMNS = [
  "Site",
  "Received (UTC)",
  "Status",
  "Reaction",
  "Message",
  "Page",
  "Page title",
  "Element",
  "Element text",
  "Browser",
  "Screen",
  "Viewport",
  "Language",
  "Time zone",
  "Referrer",
  "Visitor id",
  "Visitor name",
  "Visitor email",
  "Metadata",
] as const;

const STATUS: Record<string, string> = {
  new: "Unread",
  seen: "Read",
  done: "Done",
  archived: "Archived",
};

type ExportRow = FeedbackRow & { site_name: string };

/**
 * One CSV cell. Notes are written by strangers, so anything a spreadsheet
 * would run as a formula (=, +, -, @, or a tab or return first) gets a
 * leading apostrophe; then the usual quoting.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toLine(row: ExportRow): string {
  const context = JSON.parse(row.context) as {
    url?: string;
    title?: string;
    referrer?: string;
    viewport?: { width: number; height: number };
    screen?: { width: number; height: number };
    language?: string;
    timezone?: string;
    userAgent?: string;
  };
  const target = row.target
    ? (JSON.parse(row.target) as { selector?: string; text?: string })
    : null;
  const visitor = row.visitor
    ? (JSON.parse(row.visitor) as { id?: string; name?: string; email?: string })
    : null;
  const size = (s?: { width: number; height: number }) => (s ? `${s.width}×${s.height}` : "");
  return [
    row.site_name,
    new Date(row.created_at).toISOString(),
    STATUS[row.status] ?? row.status,
    row.reaction,
    row.message,
    context.url ?? row.page_url,
    context.title,
    target?.selector,
    target?.text,
    context.userAgent,
    size(context.screen),
    size(context.viewport),
    context.language,
    context.timezone,
    context.referrer,
    visitor?.id,
    visitor?.name,
    visitor?.email,
    row.metadata,
  ]
    .map(csvCell)
    .join(",");
}

/** The export, streamed: a header line, then the notes, newest first. */
export function notesCsv(
  db: D1Database,
  ownerId: string,
  projectId?: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cursor: { createdAt: number; id: string } | null = null;
  let started = false;
  return new ReadableStream({
    async pull(controller) {
      if (!started) {
        started = true;
        // A byte order mark, so Excel reads accents and emoji as UTF-8.
        controller.enqueue(encoder.encode(`﻿${COLUMNS.join(",")}\r\n`));
        return;
      }
      const where = ["p.owner_id = ?", "f.deleted_at IS NULL"];
      const params: (string | number)[] = [ownerId];
      if (projectId) {
        where.push("f.project_id = ?");
        params.push(projectId);
      }
      if (cursor) {
        where.push("(f.created_at, f.id) < (?, ?)");
        params.push(cursor.createdAt, cursor.id);
      }
      const { results } = await db
        .prepare(
          `SELECT f.*, p.name AS site_name
           FROM feedback f JOIN projects p ON p.id = f.project_id
           WHERE ${where.join(" AND ")}
           ORDER BY f.created_at DESC, f.id DESC LIMIT ?`,
        )
        .bind(...params, BATCH)
        .all<ExportRow>();
      if (results.length > 0) {
        controller.enqueue(encoder.encode(`${results.map(toLine).join("\r\n")}\r\n`));
        const last = results[results.length - 1] as ExportRow;
        cursor = { createdAt: last.created_at, id: last.id };
      }
      if (results.length < BATCH) controller.close();
    },
  });
}

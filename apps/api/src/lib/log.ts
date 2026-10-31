type Level = "debug" | "info" | "warn" | "error";

/**
 * Structured (JSON) logging. Workers observability indexes the fields, so you
 * can filter by `requestId` or `route` instead of grepping free text.
 */
export function log(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, message, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

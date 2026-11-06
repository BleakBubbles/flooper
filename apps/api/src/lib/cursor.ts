import { ApiError } from "./errors";

/**
 * Keyset ("cursor") pagination. Instead of OFFSET (which gets slower the deeper
 * you go and skips/duplicates rows when new ones arrive), we remember the sort
 * key of the last row we returned and ask for rows strictly after it.
 *
 * The cursor is opaque to clients: base64url JSON they should just pass back.
 */
export interface Cursor {
  createdAt: number;
  id: string;
  /** The sort column's value, when sorting by something other than time. */
  key?: string | number;
}

export function encodeCursor(cursor: Cursor): string {
  const parts =
    cursor.key === undefined
      ? [cursor.createdAt, cursor.id]
      : [cursor.createdAt, cursor.id, cursor.key];
  return btoa(JSON.stringify(parts)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeCursor(raw: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(atob(raw.replaceAll("-", "+").replaceAll("_", "/")));
    if (Array.isArray(parsed) && typeof parsed[0] === "number" && typeof parsed[1] === "string") {
      if (parsed.length === 2) return { createdAt: parsed[0], id: parsed[1] };
      if (parsed.length === 3 && ["string", "number"].includes(typeof parsed[2])) {
        return { createdAt: parsed[0], id: parsed[1], key: parsed[2] as string | number };
      }
    }
  } catch {
    // Fall through to the error below.
  }
  throw new ApiError(400, "bad_request", "Invalid cursor");
}

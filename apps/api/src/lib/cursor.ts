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
}

export function encodeCursor(cursor: Cursor): string {
  return btoa(JSON.stringify([cursor.createdAt, cursor.id]))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function decodeCursor(raw: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(atob(raw.replaceAll("-", "+").replaceAll("_", "/")));
    if (
      Array.isArray(parsed) &&
      typeof parsed[0] === "number" &&
      typeof parsed[1] === "string" &&
      parsed.length === 2
    ) {
      return { createdAt: parsed[0], id: parsed[1] };
    }
  } catch {
    // Fall through to the error below.
  }
  throw new ApiError(400, "bad_request", "Invalid cursor");
}

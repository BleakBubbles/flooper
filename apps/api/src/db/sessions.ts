import { randomToken, sha256Hex } from "../lib/crypto";
import type { UserRow } from "./users";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Create a session and return the raw token for the cookie. Only its hash is
 * stored, so the token can't be recovered from the database.
 */
export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await db
    .prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now, now + SESSION_TTL_MS)
    .run();
  return token;
}

export async function findUserBySessionToken(
  db: D1Database,
  token: string,
): Promise<UserRow | null> {
  return db
    .prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id_hash = ? AND sessions.expires_at > ?`,
    )
    .bind(await sha256Hex(token), Date.now())
    .first<UserRow>();
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE id_hash = ?")
    .bind(await sha256Hex(token))
    .run();
}

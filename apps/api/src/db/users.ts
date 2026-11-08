import type { NotificationSettings, User } from "@flooper/shared/schemas";
import { randomToken } from "../lib/crypto";
import { newId } from "../lib/ids";

// The data-access layer: every SQL statement lives in src/db, behind plain
// functions. Routes never write SQL, which keeps queries reviewable in one
// place and makes it obvious that every value goes through a `?` placeholder
// (never string concatenation, which is how SQL injection happens).

export interface UserRow {
  id: string;
  github_id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  created_at: number;
  email: string | null;
  digest_enabled: number;
  digest_sent_at: number | null;
  unsubscribe_token: string | null;
}

export interface GithubProfile {
  githubId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  /** Their primary verified address, if GitHub shared it. */
  email: string | null;
}

/**
 * Insert a user on first login, or refresh their profile on later ones. The
 * email is only filled in when they have none, so an address they changed
 * themselves is never overwritten by GitHub's.
 */
export async function upsertGithubUser(db: D1Database, profile: GithubProfile): Promise<UserRow> {
  const row = await db
    .prepare(
      `INSERT INTO users (id, github_id, login, name, avatar_url, created_at, email)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (github_id) DO UPDATE SET
         login = excluded.login,
         name = excluded.name,
         avatar_url = excluded.avatar_url,
         email = COALESCE(users.email, excluded.email)
       RETURNING *`,
    )
    .bind(
      newId("user"),
      profile.githubId,
      profile.login,
      profile.name,
      profile.avatarUrl,
      Date.now(),
      profile.email,
    )
    .first<UserRow>();
  if (!row) throw new Error("Upsert returned no row");
  return row;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    login: row.login,
    name: row.name,
    avatarUrl: row.avatar_url,
    email: row.email,
    digestEnabled: row.digest_enabled === 1,
  };
}

/**
 * Save the user's digest settings. Turning it on makes their unsubscribe
 * token if they don't have one, and starts the digest from now, so the first
 * email covers notes from here on rather than everything they ever got.
 */
export async function updateNotificationSettings(
  db: D1Database,
  userId: string,
  settings: NotificationSettings,
): Promise<UserRow> {
  const row = await db
    .prepare(
      `UPDATE users SET
         email = ?,
         digest_enabled = ?,
         unsubscribe_token = COALESCE(unsubscribe_token, ?),
         digest_sent_at = CASE WHEN ? = 1 AND digest_enabled = 0 THEN ? ELSE digest_sent_at END
       WHERE id = ?
       RETURNING *`,
    )
    .bind(
      settings.email,
      settings.digestEnabled ? 1 : 0,
      randomToken(),
      settings.digestEnabled ? 1 : 0,
      Date.now(),
      userId,
    )
    .first<UserRow>();
  if (!row) throw new Error("No such user");
  return row;
}

/** One-click unsubscribe: turns the digest off. False if the token matches no one. */
export async function unsubscribeByToken(db: D1Database, token: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE users SET digest_enabled = 0 WHERE unsubscribe_token = ?")
    .bind(token)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

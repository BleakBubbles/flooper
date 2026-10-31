import type { User } from "@flooper/shared/schemas";
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
}

export interface GithubProfile {
  githubId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

/** Insert a user on first login, or refresh their profile on later ones. */
export async function upsertGithubUser(db: D1Database, profile: GithubProfile): Promise<UserRow> {
  const row = await db
    .prepare(
      `INSERT INTO users (id, github_id, login, name, avatar_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (github_id) DO UPDATE SET
         login = excluded.login,
         name = excluded.name,
         avatar_url = excluded.avatar_url
       RETURNING *`,
    )
    .bind(
      newId("user"),
      profile.githubId,
      profile.login,
      profile.name,
      profile.avatarUrl,
      Date.now(),
    )
    .first<UserRow>();
  if (!row) throw new Error("Upsert returned no row");
  return row;
}

export function toUser(row: UserRow): User {
  return { id: row.id, login: row.login, name: row.name, avatarUrl: row.avatar_url };
}

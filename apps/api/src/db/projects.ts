import type { Project } from "@flooper/shared/schemas";
import { newId } from "../lib/ids";

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  public_key: string;
  allowed_origins: string;
  created_at: number;
}

export async function listProjects(db: D1Database, ownerId: string): Promise<ProjectRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC")
    .bind(ownerId)
    .all<ProjectRow>();
  return results;
}

/**
 * Every lookup by ID is scoped to the owner. Forgetting this is the classic
 * "IDOR" bug: user A changes the ID in a URL and sees user B's data.
 */
export function getProjectForOwner(
  db: D1Database,
  id: string,
  ownerId: string,
): Promise<ProjectRow | null> {
  return db
    .prepare("SELECT * FROM projects WHERE id = ? AND owner_id = ?")
    .bind(id, ownerId)
    .first<ProjectRow>();
}

export function getProjectByPublicKey(
  db: D1Database,
  publicKey: string,
): Promise<ProjectRow | null> {
  return db
    .prepare("SELECT * FROM projects WHERE public_key = ?")
    .bind(publicKey)
    .first<ProjectRow>();
}

export async function createProject(
  db: D1Database,
  input: { ownerId: string; name: string; allowedOrigins: string[] },
): Promise<ProjectRow> {
  const row = await db
    .prepare(
      `INSERT INTO projects (id, owner_id, name, public_key, allowed_origins, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(
      newId("project"),
      input.ownerId,
      input.name,
      newId("publicKey"),
      JSON.stringify(input.allowedOrigins),
      Date.now(),
    )
    .first<ProjectRow>();
  if (!row) throw new Error("Insert returned no row");
  return row;
}

export async function updateProject(
  db: D1Database,
  id: string,
  ownerId: string,
  patch: { name?: string; allowedOrigins?: string[] },
): Promise<ProjectRow | null> {
  // COALESCE keeps the current value for any field that wasn't sent.
  return db
    .prepare(
      `UPDATE projects SET
         name = COALESCE(?, name),
         allowed_origins = COALESCE(?, allowed_origins)
       WHERE id = ? AND owner_id = ?
       RETURNING *`,
    )
    .bind(
      patch.name ?? null,
      patch.allowedOrigins ? JSON.stringify(patch.allowedOrigins) : null,
      id,
      ownerId,
    )
    .first<ProjectRow>();
}

/**
 * Delete a project and its notes, but only if it belongs to the owner. Both
 * statements run as one batch (a single transaction), so a failure can't
 * leave orphaned notes behind. Returns false if there was nothing to delete.
 */
export async function deleteProject(db: D1Database, id: string, ownerId: string): Promise<boolean> {
  const [, removed] = await db.batch([
    db
      .prepare(
        "DELETE FROM feedback WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_id = ?)",
      )
      .bind(id, ownerId),
    db.prepare("DELETE FROM projects WHERE id = ? AND owner_id = ?").bind(id, ownerId),
  ]);
  return (removed?.meta.changes ?? 0) > 0;
}

export function allowedOrigins(row: ProjectRow): string[] {
  return JSON.parse(row.allowed_origins) as string[];
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    allowedOrigins: allowedOrigins(row),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

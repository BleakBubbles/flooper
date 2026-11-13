import { env } from "cloudflare:workers";
import type { FeedbackSubmission } from "@flooper/shared/schemas";
import { describe, expect, it } from "vitest";
import {
  deleteForever,
  insertFeedback,
  purgeDeleted,
  setDeleted,
  setStatuses,
  summarizeProjects,
  updateFeedbackStatus,
} from "../src/db/feedback";
import { deleteProject } from "../src/db/projects";
import { createProject, loginAsDev, submission } from "./helpers";

/** A note as the widget sends it. */
const note = (overrides: Record<string, unknown> = {}) =>
  submission(overrides) as FeedbackSubmission;

// The running counts (migration 0011) are kept by triggers. Whatever happens
// to notes, they must match counting the notes themselves.

/** Counting the notes themselves, the way the sidebar used to. */
async function recount(projectId: string) {
  const { results } = await env.DB.prepare(
    `SELECT status, COALESCE(reaction, '') AS reaction, deleted_at IS NOT NULL AS deleted,
            COUNT(*) AS n
     FROM feedback WHERE project_id = ? GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
  )
    .bind(projectId)
    .all();
  return results;
}

/** The running counts, leaving out buckets that are back to 0. */
async function counted(projectId: string) {
  const { results } = await env.DB.prepare(
    `SELECT status, reaction, deleted, n FROM site_counts
     WHERE project_id = ? AND n > 0 ORDER BY 1, 2, 3`,
  )
    .bind(projectId)
    .all();
  return results;
}

async function site() {
  const cookie = await loginAsDev();
  const project = await createProject(cookie);
  const owner = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?")
    .bind(project.id)
    .first<{ owner_id: string }>();
  return { project, ownerId: owner?.owner_id ?? "" };
}

describe("running counts of notes", () => {
  it("match counting the notes, whatever happens to them", async () => {
    const { project, ownerId } = await site();
    const check = async () => expect(await counted(project.id)).toEqual(await recount(project.id));

    // New notes, with and without a reaction, and a retried one (ignored).
    const ids: string[] = [];
    for (const reaction of ["bug", "bug", "love", undefined, "idea"]) {
      const sent = note(reaction ? { reaction } : { reaction: undefined });
      ids.push((await insertFeedback(env.DB, project.id, sent)).id);
      if (reaction === "love") await insertFeedback(env.DB, project.id, sent);
    }
    await check();
    expect(await counted(project.id)).toContainEqual({
      status: "new",
      reaction: "bug",
      deleted: 0,
      n: 2,
    });

    // One read, one done, then several archived at once.
    const [a, b, c, d, e] = ids as [string, string, string, string, string];
    await updateFeedbackStatus(env.DB, a, ownerId, "seen");
    await updateFeedbackStatus(env.DB, b, ownerId, "done");
    await check();
    expect(await setStatuses(env.DB, ownerId, [c, d], "archived")).toBe(2);
    await check();

    // Deleted, one restored, one deleted for good.
    expect(await setDeleted(env.DB, ownerId, [a, e], Date.now())).toBe(2);
    await check();
    expect(await setDeleted(env.DB, ownerId, [a], null)).toBe(1);
    await check();
    expect(await deleteForever(env.DB, ownerId, [e])).toBe(1);
    await check();

    // Deleted long ago: purged by the daily job.
    await setDeleted(env.DB, ownerId, [c], Date.now() - 40 * 24 * 60 * 60 * 1000);
    expect(await purgeDeleted(env.DB)).toBe(1);
    await check();

    // The site itself: its counts go with it.
    expect(await deleteProject(env.DB, project.id, ownerId)).toBe(true);
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM site_counts WHERE project_id = ?")
      .bind(project.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it("give the sidebar's summary, with the latest note that isn't deleted", async () => {
    const { project, ownerId } = await site();
    const older = await insertFeedback(env.DB, project.id, note({ reaction: "bug" }));
    await env.DB.prepare("UPDATE feedback SET created_at = created_at - 60000 WHERE id = ?")
      .bind(older.id)
      .run();
    const newest = await insertFeedback(env.DB, project.id, note({ reaction: "idea" }));
    await updateFeedbackStatus(env.DB, newest.id, ownerId, "done");

    const summary = (await summarizeProjects(env.DB, ownerId)).get(project.id);
    expect(summary).toMatchObject({ total: 2, newCount: 1, done: 1, newByReaction: { bug: 1 } });
    const newestAt = summary?.lastNoteAt;

    // The newest deleted: the latest note is the older one now.
    await setDeleted(env.DB, ownerId, [newest.id], Date.now());
    const after = (await summarizeProjects(env.DB, ownerId)).get(project.id);
    expect(after).toMatchObject({ total: 1, deleted: 1, done: 0 });
    expect(after?.lastNoteAt).not.toBe(newestAt);
    expect(after?.lastNoteAt && newestAt && after.lastNoteAt < newestAt).toBe(true);
  });

  it("find each site's latest note on the (site, time) index, not by reading its notes", async () => {
    const plan = (
      await env.DB.prepare(
        `EXPLAIN QUERY PLAN SELECT f.created_at FROM feedback f
         WHERE f.project_id = 'p' AND f.deleted_at IS NULL
         ORDER BY f.created_at DESC LIMIT 1`,
      ).all<{ detail: string }>()
    ).results
      .map((r) => r.detail)
      .join(" | ");
    expect(plan).toContain("feedback_project_created");
    expect(plan).not.toContain("TEMP B-TREE");
  });
});

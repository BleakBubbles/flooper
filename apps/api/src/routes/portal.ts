import type { Paginated } from "@flooper/shared";
import {
  bulkStatusSchema,
  createProjectSchema,
  deleteAccountSchema,
  type Feedback,
  listAllFeedbackQuerySchema,
  listFeedbackQuerySchema,
  listPagesQuerySchema,
  markAllReadSchema,
  noteIdsSchema,
  notificationSettingsSchema,
  updateFeedbackSchema,
  updateProjectSchema,
} from "@flooper/shared/schemas";
import { Hono } from "hono";
import { notesCsv } from "../db/export";
import {
  countFeedback,
  deleteForever,
  emptySummary,
  getFeedbackForOwner,
  listFeedback,
  listPageGroups,
  markAllSeen,
  type SortedFeedbackRow,
  setDeleted,
  setStatuses,
  summarizeProjects,
  toFeedback,
  updateFeedbackStatus,
} from "../db/feedback";
import {
  createProject,
  deleteProject,
  getProjectForOwner,
  listProjects,
  toProject,
  updateProject,
} from "../db/projects";
import { deleteUser, toUser, updateNotificationSettings } from "../db/users";
import type { AuthedEnv } from "../env";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { ApiError, notFound } from "../lib/errors";
import { parseJsonBody, parseQuery } from "../lib/validate";
import { clearSessionCookie, requireUser, setSignedInHint } from "../middleware/auth";

/**
 * The API the portal uses. Everything here requires a logged-in user, and
 * every query is scoped to that user's own projects. Resources that belong to
 * someone else return 404 rather than 403, so their existence isn't leaked.
 */
export const portal = new Hono<AuthedEnv>();

portal.use(requireUser);

// Also renews the "signed in" hint, so people who logged in before it
// existed (or whose hint got cleared) still land on the app at /.
portal.get("/me", (c) => {
  setSignedInHint(c);
  return c.json(toUser(c.get("user")));
});

// Delete my account: every site, every note, every session. The user types
// their GitHub username to confirm, so a stray request can't do it.
portal.delete("/me", async (c) => {
  const user = c.get("user");
  const { confirm } = await parseJsonBody(c, deleteAccountSchema);
  if (confirm.trim().toLowerCase() !== user.login.toLowerCase()) {
    throw new ApiError(422, "validation_failed", "Type your GitHub username to confirm", {
      confirm: ["That isn't your GitHub username"],
    });
  }
  await deleteUser(c.env.DB, user.id);
  clearSessionCookie(c);
  return c.body(null, 204);
});

// Export notes as CSV: every site's, or one site's (?projectId=). Streamed.
portal.get("/export.csv", async (c) => {
  const projectId = c.req.query("projectId") || undefined;
  const date = new Date().toISOString().slice(0, 10);
  return new Response(notesCsv(c.env.DB, c.get("user").id, projectId), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flooper-notes-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});

// The daily digest: on or off, and where it goes.
portal.put("/me/notifications", async (c) => {
  const settings = await parseJsonBody(c, notificationSettingsSchema);
  const row = await updateNotificationSettings(c.env.DB, c.get("user").id, settings);
  return c.json(toUser(row));
});

// Each site comes with its summary, for the cards on the home screen.
portal.get("/projects", async (c) => {
  const ownerId = c.get("user").id;
  const [rows, summaries] = await Promise.all([
    listProjects(c.env.DB, ownerId),
    summarizeProjects(c.env.DB, ownerId),
  ]);
  return c.json({
    data: rows.map((row) => ({
      ...toProject(row),
      summary: summaries.get(row.id) ?? emptySummary(),
    })),
  });
});

portal.post("/projects", async (c) => {
  const input = await parseJsonBody(c, createProjectSchema);
  const row = await createProject(c.env.DB, { ownerId: c.get("user").id, ...input });
  return c.json(toProject(row), 201);
});

portal.get("/projects/:id", async (c) => {
  const row = await getProjectForOwner(c.env.DB, c.req.param("id"), c.get("user").id);
  if (!row) throw notFound("Project");
  return c.json(toProject(row));
});

portal.patch("/projects/:id", async (c) => {
  const patch = await parseJsonBody(c, updateProjectSchema);
  const row = await updateProject(c.env.DB, c.req.param("id"), c.get("user").id, patch);
  if (!row) throw notFound("Project");
  return c.json(toProject(row));
});

portal.delete("/projects/:id", async (c) => {
  const deleted = await deleteProject(c.env.DB, c.req.param("id"), c.get("user").id);
  if (!deleted) throw notFound("Project");
  return c.body(null, 204);
});

portal.get("/projects/:id/feedback", async (c) => {
  const project = await getProjectForOwner(c.env.DB, c.req.param("id"), c.get("user").id);
  if (!project) throw notFound("Project");

  const query = parseQuery(c, listFeedbackQuerySchema);
  const result = await listFeedback(
    c.env.DB,
    { projectId: project.id },
    { ...query, cursor: query.cursor ? decodeCursor(query.cursor) : undefined },
  );
  return c.json(page(result));
});

// Notes from every one of the user's sites, for the home screen.
portal.get("/feedback", async (c) => {
  const query = parseQuery(c, listAllFeedbackQuerySchema);
  const result = await listFeedback(
    c.env.DB,
    { ownerId: c.get("user").id, projectId: query.projectId },
    {
      ...query,
      deleted: query.deleted === "1",
      hideArchived: true,
      cursor: query.cursor ? decodeCursor(query.cursor) : undefined,
    },
  );
  return c.json(page(result));
});

// The notes list grouped by page, busiest first: every site's, or one site's.
portal.get("/pages", async (c) => {
  const query = parseQuery(c, listPagesQuerySchema);
  return c.json({ data: await listPageGroups(c.env.DB, c.get("user").id, query) });
});

// "Mark all as read" on the home screen.
portal.post("/feedback/mark-all-read", async (c) => {
  const { projectId } = await parseJsonBody(c, markAllReadSchema);
  const ids = await markAllSeen(c.env.DB, c.get("user").id, projectId);
  return c.json({ updated: ids.length, ids });
});

// Delete notes: out of the app at once, kept 30 days in "Recently deleted".
portal.post("/feedback/delete", async (c) => {
  const { ids } = await parseJsonBody(c, noteIdsSchema);
  const updated = await setDeleted(c.env.DB, c.get("user").id, ids, Date.now());
  return c.json({ updated });
});

// Bring deleted notes back (Undo, or Restore in "Recently deleted").
portal.post("/feedback/restore", async (c) => {
  const { ids } = await parseJsonBody(c, noteIdsSchema);
  const updated = await setDeleted(c.env.DB, c.get("user").id, ids, null);
  return c.json({ updated });
});

// "Delete forever", from "Recently deleted": gone for good.
portal.post("/feedback/delete-forever", async (c) => {
  const { ids } = await parseJsonBody(c, noteIdsSchema);
  const deleted = await deleteForever(c.env.DB, c.get("user").id, ids);
  return c.json({ deleted });
});

// Several notes to one status (undoing "Mark all as read").
portal.post("/feedback/status", async (c) => {
  const { ids, status } = await parseJsonBody(c, bulkStatusSchema);
  const updated = await setStatuses(c.env.DB, c.get("user").id, ids, status);
  return c.json({ updated });
});

portal.get("/projects/:id/feedback/counts", async (c) => {
  const project = await getProjectForOwner(c.env.DB, c.req.param("id"), c.get("user").id);
  if (!project) throw notFound("Project");
  return c.json(await countFeedback(c.env.DB, project.id));
});

portal.get("/feedback/:id", async (c) => {
  const row = await getFeedbackForOwner(c.env.DB, c.req.param("id"), c.get("user").id);
  if (!row) throw notFound("Feedback");
  return c.json(toFeedback(row));
});

portal.patch("/feedback/:id", async (c) => {
  const { status } = await parseJsonBody(c, updateFeedbackSchema);
  const row = await updateFeedbackStatus(c.env.DB, c.req.param("id"), c.get("user").id, status);
  if (!row) throw notFound("Feedback");
  return c.json(toFeedback(row));
});

function page({
  rows,
  hasMore,
}: {
  rows: SortedFeedbackRow[];
  hasMore: boolean;
}): Paginated<Feedback> {
  const last = rows.at(-1);
  return {
    data: rows.map(toFeedback),
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id, key: last.sort_key ?? undefined })
        : null,
  };
}

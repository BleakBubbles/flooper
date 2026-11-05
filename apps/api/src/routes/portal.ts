import type { Paginated } from "@flooper/shared";
import {
  createProjectSchema,
  type Feedback,
  listFeedbackQuerySchema,
  updateFeedbackSchema,
  updateProjectSchema,
} from "@flooper/shared/schemas";
import { Hono } from "hono";
import {
  countFeedback,
  getFeedbackForOwner,
  listFeedback,
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
import { toUser } from "../db/users";
import type { AuthedEnv } from "../env";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { notFound } from "../lib/errors";
import { parseJsonBody, parseQuery } from "../lib/validate";
import { requireUser } from "../middleware/auth";

/**
 * The API the portal uses. Everything here requires a logged-in user, and
 * every query is scoped to that user's own projects. Resources that belong to
 * someone else return 404 rather than 403, so their existence isn't leaked.
 */
export const portal = new Hono<AuthedEnv>();

portal.use(requireUser);

portal.get("/me", (c) => c.json(toUser(c.get("user"))));

portal.get("/projects", async (c) => {
  const rows = await listProjects(c.env.DB, c.get("user").id);
  return c.json({ data: rows.map(toProject) });
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
  const { rows, hasMore } = await listFeedback(c.env.DB, project.id, {
    status: query.status,
    cursor: query.cursor ? decodeCursor(query.cursor) : undefined,
    limit: query.limit,
  });
  const last = rows.at(-1);
  const body: Paginated<Feedback> = {
    data: rows.map(toFeedback),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
  return c.json(body);
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

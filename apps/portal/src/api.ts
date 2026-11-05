import type { ApiErrorBody, FeedbackCounts, FeedbackStatus, Paginated } from "@flooper/shared";
import type {
  CreateProjectInput,
  Feedback,
  Project,
  UpdateProjectInput,
  User,
} from "@flooper/shared/schemas";

/** A failed API call, carrying the server's structured error. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody["error"]) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      (data as ApiErrorBody | null)?.error ?? {
        code: "internal_error",
        message: `Request failed (${res.status})`,
      },
    );
  }
  return data as T;
}

/** One typed function per endpoint. Components never call fetch directly. */
export const api = {
  me: () => request<User>("GET", "/v1/me"),
  devLogin: () => request<void>("POST", "/auth/dev-login"),
  logout: () => request<void>("POST", "/auth/logout"),

  listProjects: () => request<{ data: Project[] }>("GET", "/v1/projects"),
  getProject: (id: string) => request<Project>("GET", `/v1/projects/${id}`),
  createProject: (input: CreateProjectInput) => request<Project>("POST", "/v1/projects", input),
  updateProject: (id: string, input: UpdateProjectInput) =>
    request<Project>("PATCH", `/v1/projects/${id}`, input),
  deleteProject: (id: string) => request<void>("DELETE", `/v1/projects/${id}`),

  listFeedback: (projectId: string, opts: { status?: FeedbackStatus; cursor?: string }) => {
    const qs = new URLSearchParams();
    if (opts.status) qs.set("status", opts.status);
    if (opts.cursor) qs.set("cursor", opts.cursor);
    return request<Paginated<Feedback>>("GET", `/v1/projects/${projectId}/feedback?${qs}`);
  },
  feedbackCounts: (projectId: string) =>
    request<FeedbackCounts>("GET", `/v1/projects/${projectId}/feedback/counts`),
  getFeedback: (id: string) => request<Feedback>("GET", `/v1/feedback/${id}`),
  updateFeedback: (id: string, status: FeedbackStatus) =>
    request<Feedback>("PATCH", `/v1/feedback/${id}`, { status }),
};

/**
 * Query keys, in one place. TanStack Query caches by key, and invalidating a
 * prefix (e.g. ["feedback", projectId]) refetches everything under it.
 */
export const keys = {
  me: ["me"] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  feedback: (projectId: string, status?: FeedbackStatus) =>
    ["feedback", projectId, status ?? "all"] as const,
  // Under the "feedback" prefix, so invalidating a project's feedback refreshes its counts too.
  counts: (projectId: string) => ["feedback", projectId, "counts"] as const,
  note: (projectId: string, id: string) => ["feedback", projectId, "note", id] as const,
};

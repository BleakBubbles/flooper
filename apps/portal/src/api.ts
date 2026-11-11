import type { ApiErrorBody, FeedbackCounts, FeedbackStatus, Paginated } from "@flooper/shared";
import type {
  CreateProjectInput,
  Feedback,
  NoteSort,
  NotificationSettings,
  PageGroup,
  Project,
  ProjectWithSummary,
  UpdateProjectInput,
  User,
} from "@flooper/shared/schemas";

/** A failed API call, carrying the server's structured error. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(status: number, body: Omit<ApiErrorBody["error"], "code"> & { code: string }) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only throws when there's no response at all: offline, DNS, etc.
    // Status 0 means "never reached the server", so it's retried like a 5xx.
    throw new ApiRequestError(0, {
      code: "network_error",
      message: "Couldn't reach Flooper. Check your connection and try again.",
    });
  }
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

  listProjects: () => request<{ data: ProjectWithSummary[] }>("GET", "/v1/projects"),
  /** The sidebar's order, after a drag: every site's ID, first to last. */
  reorderProjects: (ids: string[]) => request<void>("PUT", "/v1/projects/order", { ids }),
  getProject: (id: string) => request<Project>("GET", `/v1/projects/${id}`),
  createProject: (input: CreateProjectInput) => request<Project>("POST", "/v1/projects", input),
  updateProject: (id: string, input: UpdateProjectInput) =>
    request<Project>("PATCH", `/v1/projects/${id}`, input),
  deleteProject: (id: string) => request<void>("DELETE", `/v1/projects/${id}`),
  /** Delete my account; `confirm` is the GitHub username, typed by the user. */
  deleteAccount: (confirm: string) => request<void>("DELETE", "/v1/me", { confirm }),

  listFeedback: (projectId: string, opts: { status?: FeedbackStatus; cursor?: string }) => {
    const qs = new URLSearchParams();
    if (opts.status) qs.set("status", opts.status);
    if (opts.cursor) qs.set("cursor", opts.cursor);
    return request<Paginated<Feedback>>("GET", `/v1/projects/${projectId}/feedback?${qs}`);
  },
  /** Notes from all the user's sites, for the home screen. */
  listAllFeedback: (opts: {
    status?: FeedbackStatus;
    sort: NoteSort;
    dir: "asc" | "desc";
    /** Just this site. */
    projectId?: string;
    /** Just this page's notes (a path). */
    page?: string;
    /** Search. */
    q?: string;
    /** "Recently deleted" instead. */
    deleted?: boolean;
    cursor?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams({ sort: opts.sort, dir: opts.dir });
    if (opts.projectId) qs.set("projectId", opts.projectId);
    if (opts.page) qs.set("page", opts.page);
    if (opts.q) qs.set("q", opts.q);
    if (opts.deleted) qs.set("deleted", "1");
    if (opts.status) qs.set("status", opts.status);
    if (opts.cursor) qs.set("cursor", opts.cursor);
    if (opts.limit) qs.set("limit", String(opts.limit));
    return request<Paginated<Feedback>>("GET", `/v1/feedback?${qs}`);
  },
  /** The notes grouped by page, busiest first: every site's, or just one site's. */
  listPages: (opts: { projectId?: string; status?: FeedbackStatus }) => {
    const qs = new URLSearchParams();
    if (opts.projectId) qs.set("projectId", opts.projectId);
    if (opts.status) qs.set("status", opts.status);
    return request<{ data: PageGroup[] }>("GET", `/v1/pages?${qs}`);
  },
  /** Every site's new notes, or just one site's. */
  markAllRead: (projectId?: string) =>
    request<{ updated: number; ids: string[] }>("POST", "/v1/feedback/mark-all-read", {
      projectId,
    }),
  /** Delete notes into "Recently deleted". */
  deleteNotes: (ids: string[]) =>
    request<{ updated: number }>("POST", "/v1/feedback/delete", { ids }),
  /** Bring deleted notes back. */
  restoreNotes: (ids: string[]) =>
    request<{ updated: number }>("POST", "/v1/feedback/restore", { ids }),
  /** Delete notes for good (only ones already deleted). */
  deleteNotesForever: (ids: string[]) =>
    request<{ deleted: number }>("POST", "/v1/feedback/delete-forever", { ids }),
  /** Several notes to one status (undoing "Mark all as read"). */
  setStatuses: (ids: string[], status: FeedbackStatus) =>
    request<{ updated: number }>("POST", "/v1/feedback/status", { ids, status }),
  feedbackCounts: (projectId: string) =>
    request<FeedbackCounts>("GET", `/v1/projects/${projectId}/feedback/counts`),
  getFeedback: (id: string) => request<Feedback>("GET", `/v1/feedback/${id}`),
  updateFeedback: (id: string, status: FeedbackStatus) =>
    request<Feedback>("PATCH", `/v1/feedback/${id}`, { status }),
  /** "Let them know?": email the visitor who asked to hear back, once. */
  replyToNote: (id: string, message?: string) =>
    request<Feedback>("POST", `/v1/feedback/${id}/reply`, { message }),
  /** The daily digest: on or off, and where it goes. */
  updateNotifications: (settings: NotificationSettings) =>
    request<User>("PUT", "/v1/me/notifications", settings),
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
  // The home screen's notes from every site. Invalidate ["feedback", ALL_SITES] after a change.
  allFeedback: (
    status: FeedbackStatus | "deleted" | undefined,
    sort: string,
    projectId?: string,
    page?: string,
    q?: string,
  ) =>
    [
      "feedback",
      ALL_SITES,
      projectId ?? "every-site",
      status ?? "all",
      sort,
      page ?? "every-page",
      q ?? "",
    ] as const,
  // The notes grouped by page. Under "feedback" too, so any change to a note
  // refreshes the groups.
  pages: (projectId?: string, status?: FeedbackStatus) =>
    ["feedback", ALL_SITES, "pages", projectId ?? "every-site", status ?? "all"] as const,
};

export const ALL_SITES = "all-sites";

// Zero-dependency constants and types shared by the SDK, API and portal.
//
// The SDK imports from here, so nothing in this file may pull in runtime
// dependencies (like zod) that would bloat the widget bundle. Schemas live in
// `./schemas` and are imported only by the API and portal.

export const API_VERSION = "v1";

/** URL parameter the portal adds to "Show me" links; the widget reads it. */
export const HIGHLIGHT_PARAM = "flooper-highlight";

/** One-click reactions a visitor can leave without typing anything. */
export const REACTIONS = ["love", "idea", "confused", "bug"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const REACTION_EMOJI: Record<Reaction, string> = {
  love: "❤️",
  idea: "💡",
  confused: "🤔",
  bug: "🐛",
};

/** Lifecycle of a piece of feedback from the site owner's point of view. */
export const FEEDBACK_STATUSES = ["new", "seen", "done", "archived"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/**
 * How many notes a project has in each status, plus the total, and when and
 * where the most recent one was left (null before the first note).
 */
export type FeedbackCounts = Record<FeedbackStatus, number> & {
  total: number;
  latest: { createdAt: string; pageUrl: string } | null;
};

export const LIMITS = {
  messageMaxLength: 2000,
  /** Hard cap on the request body the ingest endpoint will read, in bytes. */
  ingestBodyMaxBytes: 16 * 1024,
  metadataMaxKeys: 20,
  metadataValueMaxLength: 200,
  allowedOriginsMax: 10,
  projectNameMaxLength: 60,
  pageSizeDefault: 25,
  pageSizeMax: 100,
} as const;

/** Every non-2xx API response has this shape. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-level validation problems, keyed by dotted path. */
    details?: Record<string, string[]>;
  };
}

export type ApiErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "origin_not_allowed"
  | "payload_too_large"
  | "rate_limited"
  /** The site has had its day's worth of notes (see NOTES_PER_SITE_PER_DAY). */
  | "site_limit_reached"
  /** Incoming notes are switched off for now (INGEST_PAUSED), e.g. during an incident. */
  | "paused"
  | "internal_error";

export interface Paginated<T> {
  data: T[];
  /** Opaque cursor for the next page, or null when there are no more results. */
  nextCursor: string | null;
}

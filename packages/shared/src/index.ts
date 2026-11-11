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

/**
 * The website a note was left on, as visitors know it: the page's host
 * ("example.com"). Emails to visitors use this, never the site's name in
 * Flooper, which is the owner's own label.
 */
export function noteHost(pageUrl: string): string {
  try {
    return new URL(pageUrl).host.replace(/^www\./, "");
  } catch {
    return "the site";
  }
}

/**
 * What a reply says when the owner doesn't write anything: fitted to the
 * note's reaction, and to whether it's done. Shown as the placeholder in
 * "Let them know?", so the owner sees exactly what goes out.
 */
export function defaultReplyMessage(
  host: string,
  done: boolean,
  reaction: Reaction | null = null,
): string {
  switch (reaction) {
    case "bug":
      return done
        ? `The problem you reported on ${host} has been fixed. Thanks for letting us know.`
        : `Thanks for reporting a problem on ${host}. It's been read, and it's being looked into.`;
    case "idea":
      return done
        ? `Your idea for ${host} has been addressed. Thanks for suggesting it.`
        : `Thanks for your idea for ${host}. It's been read, and it's being considered.`;
    case "confused":
      return done
        ? `What you found confusing on ${host} has been addressed. Thanks for pointing it out.`
        : `Thanks for pointing out what was confusing on ${host}. It's being looked into.`;
    case "love":
      return `Thanks for the kind words about ${host}. They're much appreciated.`;
    default:
      return done
        ? `Your note on ${host} has been addressed. Thanks for taking the time to send it.`
        : `Thanks for your note on ${host}. It's been read, and it's being looked into.`;
  }
}

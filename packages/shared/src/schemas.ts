// Runtime-validated schemas for everything that crosses a trust boundary.
//
// The API validates every incoming request with these, and the portal and SDK
// derive their TypeScript types from them (`z.infer`), so the contract is
// defined exactly once. The SDK only ever does `import type` from this file,
// which is erased at build time and keeps zod out of the widget bundle.

import { z } from "zod";
import { FEEDBACK_STATUSES, LIMITS, REACTIONS } from "./index";

const metadataValue = z.union([
  z.string().max(LIMITS.metadataValueMaxLength),
  z.number(),
  z.boolean(),
]);

export const pageContextSchema = z.object({
  url: z.url().max(2048),
  path: z.string().max(2048),
  title: z.string().max(300).optional(),
  referrer: z.string().max(2048).optional(),
  viewport: z.object({ width: z.number().int().min(0), height: z.number().int().min(0) }),
  screen: z.object({ width: z.number().int().min(0), height: z.number().int().min(0) }).optional(),
  language: z.string().max(35).optional(),
  timezone: z.string().max(64).optional(),
  userAgent: z.string().max(512).optional(),
  sdkVersion: z.string().max(32),
});

/** A specific element the visitor pointed at ("I like this part"). */
export const targetSchema = z.object({
  selector: z.string().max(1000),
  text: z.string().max(200).optional(),
});

export const visitorSchema = z.object({
  id: z.string().max(200).optional(),
  email: z.email().max(320).optional(),
  name: z.string().max(200).optional(),
});

export const feedbackSubmissionSchema = z
  .object({
    /** Client-generated UUID so retries never create duplicates. */
    idempotencyKey: z.uuid(),
    reaction: z.enum(REACTIONS).optional(),
    message: z.string().trim().max(LIMITS.messageMaxLength).optional(),
    context: pageContextSchema,
    target: targetSchema.optional(),
    visitor: visitorSchema.optional(),
    metadata: z
      .record(z.string().max(64), metadataValue)
      .refine((m) => Object.keys(m).length <= LIMITS.metadataMaxKeys, {
        message: `At most ${LIMITS.metadataMaxKeys} metadata keys`,
      })
      .optional(),
    /** Honeypot: hidden from humans, so any value means a bot filled it in. */
    hp: z.string().max(500).optional(),
  })
  .refine((f) => f.reaction !== undefined || (f.message !== undefined && f.message.length > 0), {
    message: "Send a reaction, a message, or both",
    path: ["message"],
  });

export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;
export type PageContext = z.infer<typeof pageContextSchema>;
export type Target = z.infer<typeof targetSchema>;
export type Visitor = z.infer<typeof visitorSchema>;

// ---------------------------------------------------------------------------
// Portal API

const origin = z
  .url()
  .transform((u) => new URL(u).origin)
  .refine((o) => o !== "null", { message: "Must be an http(s) origin" });

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.projectNameMaxLength),
  allowedOrigins: z.array(origin).max(LIMITS.allowedOriginsMax).default([]),
});

/**
 * Changing a site: only what's sent changes. Spelled out rather than
 * createProjectSchema.partial(), whose allowedOrigins default of [] would
 * otherwise fill in, so renaming a site would erase its allowed origins.
 */
export const updateProjectSchema = z.object({
  name: createProjectSchema.shape.name.optional(),
  allowedOrigins: z.array(origin).max(LIMITS.allowedOriginsMax).optional(),
});

export const updateFeedbackSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES),
});

export const listFeedbackQuerySchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(LIMITS.pageSizeDefault),
});

/**
 * The home screen's list of notes across every site the user owns. Archived
 * notes are left out unless asked for with status=archived.
 */
/** What the home screen's list can be sorted by: one of its columns. */
export const NOTE_SORTS = ["time", "site", "reaction", "page", "note"] as const;
export type NoteSort = (typeof NOTE_SORTS)[number];

export const listAllFeedbackQuerySchema = listFeedbackQuerySchema.extend({
  /** Newest first unless asked otherwise. */
  sort: z.enum(NOTE_SORTS).default("time"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  /** Just this one of the user's sites. */
  projectId: z.string().max(64).optional(),
  /** Just the notes left on this page (its path, as in `context.path`). */
  page: z.string().max(2048).optional(),
  /** Search: notes whose message, page or picked element's text contains this. */
  q: z.string().trim().min(1).max(200).optional(),
  /** "1": the notes deleted in the last 30 days instead ("Recently deleted"). */
  deleted: z.literal("1").optional(),
});

/**
 * The notes list grouped by page: every site's pages, or just one site's.
 * Counts and notes follow `status` like the list does (archived left out
 * unless asked for).
 */
export const listPagesQuerySchema = z.object({
  projectId: z.string().max(64).optional(),
  status: z.enum(FEEDBACK_STATUSES).optional(),
});

/** "Mark all as read": every site's new notes, or just one site's. */
export const markAllReadSchema = z.object({
  projectId: z.string().max(64).optional(),
});

/** "Delete my account": the user types their GitHub username to confirm. */
export const deleteAccountSchema = z.object({
  confirm: z.string().max(100),
});

/** Several notes at once: to delete, restore, or delete for good. */
export const noteIdsSchema = z.object({
  ids: z.array(z.string().max(64)).min(1).max(5000),
});

/** Several notes to one status at once (undoing "Mark all as read", say). */
export const bulkStatusSchema = z.object({
  ids: z.array(z.string().max(64)).min(1).max(5000),
  status: z.enum(FEEDBACK_STATUSES),
});

export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;

// ---------------------------------------------------------------------------
// Resources returned by the portal API. Timestamps are ISO 8601 strings.

export interface User {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  /** Where daily digests go (from GitHub at first sign-in, then the user's to change). */
  email: string | null;
  /** Whether they get a daily email about new notes. Off until they turn it on. */
  digestEnabled: boolean;
}

/** Turning the daily digest on or off, and where it goes. */
export const notificationSettingsSchema = z
  .object({
    email: z.email().max(254).nullable(),
    digestEnabled: z.boolean(),
  })
  .refine((s) => !s.digestEnabled || s.email !== null, {
    message: "Add an email address to get the daily digest",
    path: ["email"],
  });
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export interface Project {
  id: string;
  name: string;
  publicKey: string;
  allowedOrigins: string[];
  createdAt: string;
}

/** At-a-glance numbers for a site, for its card on the home screen. */
export interface ProjectSummary {
  /** Notes still marked new. */
  newCount: number;
  /** New notes by reaction. Notes without a reaction aren't counted here. */
  newByReaction: Partial<Record<(typeof REACTIONS)[number], number>>;
  /** Every note, whatever its status. */
  total: number;
  /** Notes marked done. */
  done: number;
  /** Archived notes, which the home screen's list leaves out. */
  archived: number;
  /** Notes deleted in the last 30 days ("Recently deleted"); not in `total`. */
  deleted: number;
  lastNoteAt: string | null;
  /** Notes per day for the last 14 days, oldest first. The last entry is the last 24 hours. */
  activity: number[];
}

/**
 * One page of one site, and the notes left on it: counts, and the newest few
 * notes themselves. Archived notes aren't counted unless asked for, like the
 * notes list.
 */
export interface PageGroup {
  projectId: string;
  /** The page's path, as in a note's `context.path`. */
  path: string;
  total: number;
  /** Notes still marked new. */
  newCount: number;
  /** Notes by reaction. Notes without a reaction aren't counted here. */
  byReaction: Partial<Record<(typeof REACTIONS)[number], number>>;
  lastNoteAt: string;
  /** The page's newest notes (a few), newest first. The rest load by page. */
  notes: Feedback[];
}

/** A site as the sites list returns it: the project plus its summary. */
export interface ProjectWithSummary extends Project {
  summary: ProjectSummary;
}

export interface Feedback {
  id: string;
  projectId: string;
  status: (typeof FEEDBACK_STATUSES)[number];
  reaction: (typeof REACTIONS)[number] | null;
  message: string | null;
  context: PageContext;
  target: Target | null;
  visitor: Visitor | null;
  metadata: Record<string, string | number | boolean> | null;
  createdAt: string;
  /** When it was deleted, while it's in "Recently deleted"; null otherwise. */
  deletedAt: string | null;
}

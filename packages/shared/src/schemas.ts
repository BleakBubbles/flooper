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

export const updateProjectSchema = createProjectSchema.partial();

export const updateFeedbackSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES),
});

export const listFeedbackQuerySchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(LIMITS.pageSizeDefault),
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
}

export interface Project {
  id: string;
  name: string;
  publicKey: string;
  allowedOrigins: string[];
  createdAt: string;
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
}

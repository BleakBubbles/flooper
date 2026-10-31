import { randomString } from "./crypto";

/**
 * Prefixed IDs (the Stripe convention): `fb_3k9x...` is obviously a piece of
 * feedback, which makes logs, URLs and support requests much easier to read.
 * 24 base32 characters = 120 random bits, so collisions aren't a concern.
 */
const PREFIXES = {
  user: "usr",
  project: "prj",
  feedback: "fb",
  publicKey: "pk",
} as const;

export function newId(kind: keyof typeof PREFIXES): string {
  return `${PREFIXES[kind]}_${randomString(24)}`;
}

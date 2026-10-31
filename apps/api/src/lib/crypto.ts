// Crockford-style base32 (no i, l, o, u): unambiguous to read aloud and URL-safe.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** A random string of `length` base32 characters (5 bits of entropy each). */
export function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  // 256 is a multiple of 32, so masking to 5 bits keeps every character equally likely.
  for (const byte of bytes) out += ALPHABET[byte & 31];
  return out;
}

/** 32 random bytes as base64url. Used for session tokens and OAuth state. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

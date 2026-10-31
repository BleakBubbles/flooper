import type { Context } from "hono";
import type { z } from "zod";
import { ApiError, validationError } from "./errors";

const DEFAULT_MAX_BYTES = 64 * 1024;

/**
 * Read, size-limit, parse and validate a JSON request body. Every route that
 * accepts a body goes through here, so "is this input trustworthy?" has
 * exactly one answer.
 */
export async function parseJsonBody<S extends z.ZodType>(
  c: Context,
  schema: S,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<z.output<S>> {
  // Content-Length is a cheap early reject, but it can be absent or wrong, so
  // the real check happens on the bytes we actually read.
  const declared = Number(c.req.header("Content-Length") ?? 0);
  if (declared > maxBytes) throw tooLarge(maxBytes);

  const text = await c.req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw tooLarge(maxBytes);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiError(400, "bad_request", "Request body must be valid JSON");
  }
  return parseWith(schema, raw);
}

export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  return parseWith(schema, c.req.query());
}

function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

const tooLarge = (maxBytes: number) =>
  new ApiError(413, "payload_too_large", `Request body must be at most ${maxBytes} bytes`);

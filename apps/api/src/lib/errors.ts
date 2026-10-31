import type { ApiErrorBody, ApiErrorCode } from "@flooper/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

/**
 * An error that is safe to show to the client. Anything thrown that is *not*
 * an ApiError is treated as a bug: logged in full, and reported to the client
 * as a generic 500 so internals never leak.
 */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, string[]>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found`);

export const unauthorized = () => new ApiError(401, "unauthorized", "You need to log in first");

export function validationError(error: z.ZodError): ApiError {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "(root)";
    details[path] ??= [];
    details[path].push(issue.message);
  }
  return new ApiError(422, "validation_failed", "Some fields are invalid", details);
}

import { describe, expect, it } from "vitest";
import { createProjectSchema, feedbackSubmissionSchema } from "./schemas";

const base = {
  idempotencyKey: "6f1c2b9e-3d4a-4b5c-8d6e-7f8091a2b3c4",
  context: {
    url: "https://example.com/about",
    path: "/about",
    viewport: { width: 1280, height: 800 },
    sdkVersion: "0.0.0",
  },
};

describe("feedbackSubmissionSchema", () => {
  it("accepts a reaction on its own", () => {
    expect(feedbackSubmissionSchema.safeParse({ ...base, reaction: "love" }).success).toBe(true);
  });

  it("accepts a message on its own", () => {
    expect(feedbackSubmissionSchema.safeParse({ ...base, message: "cool site!" }).success).toBe(
      true,
    );
  });

  it("rejects a submission with neither reaction nor message", () => {
    const result = feedbackSubmissionSchema.safeParse({ ...base, message: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects unknown reactions", () => {
    expect(feedbackSubmissionSchema.safeParse({ ...base, reaction: "angry" }).success).toBe(false);
  });

  it("rejects too many metadata keys", () => {
    const metadata = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]));
    expect(
      feedbackSubmissionSchema.safeParse({ ...base, reaction: "love", metadata }).success,
    ).toBe(false);
  });
});

describe("createProjectSchema", () => {
  it("normalizes allowed origins", () => {
    const result = createProjectSchema.parse({
      name: "My site",
      allowedOrigins: ["https://example.com/some/path?q=1"],
    });
    expect(result.allowedOrigins).toEqual(["https://example.com"]);
  });
});

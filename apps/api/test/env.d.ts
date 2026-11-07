import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      /** A secret in production (see src/env.ts); tests flip it directly. */
      INGEST_PAUSED?: string;
    }
    // Types `exports` from "cloudflare:workers" as our Worker's own exports.
    interface GlobalProps {
      mainModule: typeof import("../src/index");
    }
  }
}

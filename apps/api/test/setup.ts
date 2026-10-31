import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Runs before each test file. Each test file gets isolated storage, so this
// starts every file from a freshly migrated, empty database.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

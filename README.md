<p align="center">
  <img src="apps/portal/public/logo.svg" width="88" height="88" alt="Flooper logo">
</p>

<h1 align="center">Flooper</h1>

<p align="center">A tiny, chill feedback widget for indie websites.<br>
Visitors leave a reaction or a little note; you read them in the portal.</p>

> **Status:** early, a passion and learning project. Expect things to change.
> The name comes from the logo: the little creature is a flooper.

## What it does

- **A small floating button** on your site (about 8 KB gzipped, no dependencies, isolated in Shadow DOM).
- **One-click reactions** (❤️ 💡 🤔 🐛) and/or a short note.
- **Useful context, nothing creepy:** page, viewport, language. Query strings are dropped by default.
- **A portal** where you see notes per site and mark them seen, done or archived.

## Add it to your site

```html
<script
  src="https://YOUR-FLOOPER-HOST/sdk/flooper.js"
  data-project-key="pk_..."
  data-api-url="https://YOUR-FLOOPER-HOST"
  defer
></script>
```

Or from a bundler:

```ts
import { init } from "@flooper/sdk";

const flooper = init({ projectKey: "pk_...", apiUrl: "https://YOUR-FLOOPER-HOST" });
flooper.identify({ name: "Sam" }); // optional
```

## Repository layout

```
apps/
  api/        Cloudflare Worker (Hono + D1): ingest endpoint, auth, portal API
  portal/     React app for site owners (served by the same Worker)
packages/
  sdk/        The embeddable widget (vanilla TypeScript)
  shared/     The contract: constants, zod schemas and types used by all three
docs/         Architecture notes and decision records
```

See [docs/architecture.md](docs/architecture.md) for how the pieces fit together and why.

## Local development

Requirements: Node 22+ and pnpm 10 (`corepack enable` gets you pnpm).

```bash
pnpm install
pnpm --filter @flooper/api db:reset   # create the local database, migrate, and seed it
pnpm dev                            # API :8787, portal :5173, SDK playground :5174
```

Then:

1. Open the **playground** at http://localhost:5174, click the creature, and send a note.
2. Open the **portal** at http://localhost:5173 and choose **Continue as dev user**. The note shows up under _SDK Playground_.

GitHub login is optional locally. To try it, copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and follow the instructions in that file.

### Everyday commands

| Command                     | What it does                                                      |
| --------------------------- | ----------------------------------------------------------------- |
| `pnpm test`                 | Run all tests (the API tests run inside the real Workers runtime) |
| `pnpm typecheck`            | Type-check every package                                          |
| `pnpm lint` / `pnpm format` | Check / fix formatting and lint rules (Biome)                     |
| `pnpm build`                | Build the SDK and portal                                          |
| `pnpm size`                 | Check the SDK bundle against its size budget                      |

## Deploying (Cloudflare)

1. `pnpm --filter @flooper/api exec wrangler d1 create flooper`, then put the ID it prints in `apps/api/wrangler.jsonc` (both `database_id` entries).
2. `pnpm --filter @flooper/api db:migrate:remote`
3. Set secrets: `wrangler secret put GITHUB_CLIENT_ID --env production` (same for `GITHUB_CLIENT_SECRET`).
4. `pnpm build && pnpm --filter @flooper/api exec wrangler deploy --env production`

## License

[MIT](LICENSE)

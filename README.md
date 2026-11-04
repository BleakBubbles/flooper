<p align="center">
  <img src="apps/portal/public/logo.svg" width="88" height="88" alt="Flooper logo">
</p>

<h1 align="center">Flooper</h1>

<p align="center">A tiny, chill feedback widget for indie websites.<br>
Visitors leave a reaction or a little note; you read them in the portal.</p>

> **Status:** early, a passion and learning project. Expect things to change.
> The name comes from the logo: the little creature is a flooper.

## What it does

- **A small floating button** on your site (about 7 KB gzipped, no dependencies, isolated in Shadow DOM).
- **One-click reactions** (❤️ 💡 🤔 🐛) and/or a short note.
- **Point at a thing:** visitors can pick the exact part of the page they mean.
  Add `data-flooper-ignore` to anything that should never be pickable.
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

The live instance runs at https://flooper.macks0554.workers.dev.

**Deploys are automatic.** Every push to `main` that passes CI applies any new
database migrations and deploys (see `.github/workflows/ci.yml`). Migrations run
_before_ the new code goes live, so each one must keep the current code working:
add tables and columns freely, but rename or drop things across two releases.
To redeploy by hand, use **Run workflow** on the CI workflow in the Actions tab.

The pipeline uses a `CLOUDFLARE_API_TOKEN` secret (Workers edit + D1 edit) in
the repo's `production` environment, and a `CLOUDFLARE_ACCOUNT_ID` variable.

Deploying your own copy from scratch:

1. Log in: `pnpm --filter @flooper/api exec wrangler login`
2. Create the database: `pnpm --filter @flooper/api exec wrangler d1 create flooper`,
   then put the ID it prints in `apps/api/wrangler.jsonc` under `env.production`.
3. Create the tables: `pnpm --filter @flooper/api db:migrate:remote`
4. Deploy: `pnpm --filter @flooper/api run deploy` (builds everything, then
   deploys). It prints your URL, `https://flooper.<account>.workers.dev`.
5. Create a [GitHub OAuth app](https://github.com/settings/developers) with that
   URL as the homepage, and `<url>/api/auth/github/callback` as the redirect URI.
6. Store its credentials as secrets (each command prompts for the value):
   `pnpm --filter @flooper/api exec wrangler secret put GITHUB_CLIENT_ID --env production`,
   then the same for `GITHUB_CLIENT_SECRET`.

Later database changes: add a migration, run step 3, then step 4.

### Moving to a custom domain

1. Add the domain to Cloudflare, then add a `"routes": [{ "pattern": "your.domain",
   "custom_domain": true }]` entry under `env.production` in `wrangler.jsonc`.
2. Add `https://your.domain/api/auth/github/callback` as a second redirect URI in
   the GitHub OAuth app (the old one can stay during the switch), and update its
   homepage URL.
3. Change the `og:image` URL in `apps/portal/index.html`, then deploy.
4. Sessions don't carry over between domains, so everyone signs in once more.
   Widgets already embedded with the workers.dev URL keep working.

## License

[MIT](LICENSE)

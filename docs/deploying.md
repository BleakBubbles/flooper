# Deploying

Flooper runs on Cloudflare: one Worker serves the API, the app and the widget
script, with a D1 database. The live instance is https://flooper.app.

## Automatic deploys

Every push to `main` that passes CI applies any new database migrations and
deploys (see `.github/workflows/ci.yml`). Migrations run _before_ the new code
goes live, so each one must keep the current code working: add tables and
columns freely, but rename or drop things across two releases. To redeploy by
hand, use **Run workflow** on the CI workflow in the Actions tab.

The pipeline uses a `CLOUDFLARE_API_TOKEN` secret (Workers edit + D1 edit) in
the repo's `production` environment, and a `CLOUDFLARE_ACCOUNT_ID` variable.

## Your own copy, from scratch

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

Later database changes: add a migration, run step 3, then step 4. For digest
emails, see [operations.md](operations.md#the-daily-digest).

## Moving to a custom domain

1. Add the domain to the same Cloudflare account, then add a `"routes": [{
   "pattern": "your.domain", "custom_domain": true }]` entry under
   `env.production` in `wrangler.jsonc`. The deploy token needs permission to
   manage Workers routes on that zone.
2. Change `PUBLIC_URL` in `wrangler.jsonc`, the `og:image` URL in
   `apps/portal/index.html`, and the addresses in `.github/workflows/ci.yml`,
   then deploy.
3. In the GitHub OAuth app, change the callback URL to
   `https://your.domain/api/auth/github/callback` and the homepage URL to match.
   An OAuth app has exactly **one** callback URL, so from this moment login
   works on the new domain only.
4. Sessions don't carry over between domains, so everyone signs in once more.
   Widgets already embedded with the workers.dev URL keep working: the Worker
   still answers there.

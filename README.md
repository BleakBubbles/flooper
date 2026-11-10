<p align="center">
  <img src="apps/portal/public/logo.svg" width="88" height="88" alt="Flooper logo">
</p>

<h1 align="center">Flooper</h1>

<p align="center">A tiny feedback widget for your websites.</p>

Visitors tap a reaction (❤️ 💡 🤔 🐛), leave a short note, and can point at the
exact part of the page they mean. You read the notes at
[flooper.app](https://flooper.app), with the page, element, browser and screen
size attached.

- **Small:** under 10 KB gzipped, no dependencies. CI fails if it grows past that.
- **Separate:** runs in a shadow root, isolated from your styles.
- **Secure:** only accepts notes from the sites you allow.
- **Scriptable:** `Flooper.identify({ id })`, `Flooper.open()` and `Flooper.close()`.
- **Daily digest:** an opt-in email about new notes, with one-click unsubscribe.

## Add it to your site

Log in at [flooper.app](https://flooper.app), add your site, and paste its
snippet before `</body>`:

```html
<script
  src="https://flooper.app/sdk/flooper.js"
  data-project-key="pk_..."
  defer
></script>
```

Add `data-flooper-ignore` to anything visitors shouldn't be able to point at.
To open it from your own button instead of the floating one, add
`data-launcher="false"` and call `Flooper.open()`.

## Development

Requires Node 22+ and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm --filter @flooper/api db:reset   # local database: create, migrate, seed
pnpm dev                              # API :8787, app :5173, widget playground :5174
```

Send a note from the playground at http://localhost:5174, then open
http://localhost:5173 and choose **Continue as dev user** to read it. GitHub
login is optional locally: see `apps/api/.dev.vars.example`.

| Command                     | What it does                                          |
| --------------------------- | ----------------------------------------------------- |
| `pnpm test`                 | All tests (the API's run in the real Workers runtime) |
| `pnpm typecheck`            | Type-check every package                              |
| `pnpm lint` / `pnpm format` | Check / fix with Biome                                |
| `pnpm build`                | Build the widget and the app                          |
| `pnpm size`                 | Check the widget against its 10 KB budget             |

```
apps/api/         Cloudflare Worker (Hono + D1): ingest, auth, app API, digest
apps/portal/      The app and landing page (React), served by the same Worker
packages/sdk/     The widget (vanilla TypeScript)
packages/shared/  Constants, zod schemas and types shared by all three
docs/             Architecture, decisions, deploying, operations, roadmap
```

Every push to `main` that passes CI deploys to flooper.app. See
[docs/deploying.md](docs/deploying.md) to run your own copy, and
[docs/operations.md](docs/operations.md) for limits, pausing and email.

## License

[MIT](LICENSE)

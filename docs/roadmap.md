# Roadmap

A rough order of what's next, and why. Nothing here is a promise; it's a
place to keep ideas so they don't get lost. Finished items move to the bottom.

## Next

### "Show me on the page"

Next to a picked element in the portal, a button opens the page with
`?flooper-highlight=<selector>`. The SDK (already on that site) scrolls to the
element and outlines it.

### First deploy

Ship to Cloudflare (Workers + D1) and exercise everything that only exists in
production: GitHub OAuth, `Secure` cookies, the single-origin asset routing,
and production config. Then put the widget on a real page.

Deploy checklist extras: make `og:image` in `apps/portal/index.html` an
absolute URL on the real domain, and upload
`design/logo/github-social-preview.png` in the GitHub repo's settings
(Settings → General → Social preview).

## Later

### Notifications

An email (or daily digest) when new notes arrive, so owners don't have to
remember to check the portal. Introduces background work (Queues or Cron
Triggers) and sending email.

### Close the loop

Visitors can optionally leave contact details and hear back when their note is
marked done. Builds on notifications.

### Feedback heat map ("review mode")

Show feedback **overlaid on the owner's live site**: elements glow in proportion
to how many notes point at them, with pins showing reaction counts
(❤️ 4 💡 2). Clicking a pin shows the notes and lets the owner triage them in
place.

Why on the live site: the SDK is already running there, so it can draw the
overlay itself. Embedding the site in the portal in an iframe doesn't work in
general (many sites forbid framing, and cross-origin frames can't be
inspected), and screenshots go stale and raise privacy questions.

Sketch of how it works:

1. In the portal, the owner clicks **View on site**.
2. The site opens with a short-lived, read-only **review token** for that one
   project in the URL fragment (`#...`). Fragments are never sent to servers,
   and the SDK removes it from the address bar right away.
3. The SDK sees the token and **lazy-loads a separate review bundle**, so
   normal visitors never download it and the widget stays small.
4. The SDK fetches the feedback for the current page and draws it: a glow per
   element, pins with reaction badges, and a sidebar for notes with no target
   or whose element no longer exists (selectors drift as sites change).

Heat is per **element**, not per screen coordinate: coordinates mean different
things on different screen sizes, while elements survive responsive layouts and
answer the real question ("what are people reacting to?").

Stepping stones, each useful on its own:

1. **Per-page heat in the portal:** which pages get the most feedback, with
   reaction breakdowns. Needs only the page path, which is already captured
   (worth promoting to an indexed `page_path` column).
2. **The picker,** so notes carry selectors.
3. **"Show me on the page,"** the single-note version of review mode.
4. **Full review mode:** per-element aggregation, review tokens, the
   lazy-loaded overlay, pins and the drift sidebar.

Production patterns it would exercise: scoped short-lived credentials,
code splitting, aggregation queries, and designing for data that drifts.

## Done

- **Point at a thing (element picker), 2026-11-04.** Visitors pick an element;
  notes carry `target: { selector, text }`. See `packages/sdk/src/picker/`.

## Not planned (for now)

- Screenshots or session replay (storage costs and privacy).
- Teams, roles and billing.

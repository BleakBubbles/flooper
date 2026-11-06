# Roadmap

A rough order of what's next, and why. Nothing here is a promise; it's a
place to keep ideas so they don't get lost. Finished items move to the bottom.

## Next

### Remaining from the first deploy

- Put the widget on a real page (your own site) and live with it for a bit.

## Later

### Going public (open-sourcing)

The repo is private for now. When it's time to make it public:

1. Check the full git history for anything that shouldn't be public (secrets,
   personal data). Making the repo public publishes every past commit too.
2. Switch the visibility: Settings → General → Danger Zone → Change visibility.
3. Upload `design/logo/github-social-preview.png` under Settings → General →
   Social preview. (GitHub only offers this for public repositories.)
4. Turn on private vulnerability reporting (Settings → Security), which
   `SECURITY.md` tells people to use.
5. Optionally publish the SDK to npm as `@flooper/sdk` (claim the `@flooper`
   scope first).

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

- **Portal redesign, 2026-11-05.** One header (logo / site switcher, Site
  settings, account); the inbox is a single panel whose toolbar holds the
  heading and filters; new sites open on a Setup checklist that turns into the
  inbox when the first note arrives. Light theme from the "wall of notes"
  direction, dark from "ink". Mockups: the "Flooper portal directions" canvas.
- **"Show me on the page", 2026-11-05.** Feedback cards with a picked element
  link to the page with `?flooper-highlight=<selector>`; the widget there
  scrolls to the element and outlines it. Links only go to the project's own
  allowed origins, and ingest now rejects page URLs from other origins.
- **The app at flooper.app/, 2026-11-06.** Signed in, `/` is the app; signed
  out, it's the landing page, which also lives at `/about` (linked from the
  account menu). Login is at `/login`. A readable `flooper_signed_in` hint
  cookie, set beside the HttpOnly session (and renewed by `/me`), lets the page
  pick without a flash; it grants nothing. Old `/app` links redirect to `/`,
  keeping `?site=` and `?note=`.
- **Home screen as a hub, 2026-11-06.** `/app` is laid out like a mail
  app, and everything about your sites happens there, with the sidebar always
  in view:
  - **Sidebar:** "All sites", then your sites oldest first, each with its
    favicon (or a letter tile), its unread count and a ⋯ menu ("Mark all as
    read", "Site settings"; right-click opens it too), then "+ Add a site".
  - **Notes:** every site's notes in one list, or one site's when picked. The
    columns (site, reaction, note, page, when) sort ascending, descending or
    off (newest first). Unread notes are bold; rows have quick actions
    (read/unread, done, archive); a menu shows all, unread, done or archived;
    an icon button marks the current view as read.
  - **The open note** sits in a card on the right (inline on smaller
    screens), with relative times and the exact time on hover. A note counts
    as read once you click off it (close it, open another, or leave the
    list), and "seen" now shows as "Read".
  - **Adding a site** starts with its address (it's named after it, renamable
    later), then all three setup steps show at once: address, snippet, test
    note. A site stays on these steps until its first note arrives, which then
    opens in the list. A brand-new account sees exactly this.
  - **Settings** open in the same spot: status, name, addresses, snippet,
    delete.
  - The separate site, setup, settings and inbox pages are gone; their old
    links redirect into home. Disabled primary buttons now draw as ghost
    buttons everywhere.

  New API: per-site summaries on `GET /v1/projects` (oldest first),
  `GET /v1/feedback` across sites (or one, via `projectId`; archived left out;
  `sort` and `dir`), and `POST /v1/feedback/mark-all-read` (all sites, or one
  via `projectId`). Mockups: the "Home screen" row on the directions canvas.
- **Landing page, 2026-11-05.** https://flooper.app now opens on black, with
  example notes turning on a ring around the headline. Like the logo, the ring
  has a gap at the top right: notes slip into it and new ones come out the
  other side, ticking up a "new notes" counter. Then the three steps as pictures, and
  the technical claims shown in a mock browser's DevTools, each in the tab
  where you'd check it yourself. The app moved to `/app`; old `/projects/...`
  links redirect there. Mockup: "Landing B v2" on the directions canvas.
- **Own domain, 2026-11-05.** Moved to https://flooper.app (registered with
  Cloudflare). The workers.dev address still accepts notes from old snippets.
- **First deploy, 2026-11-04.** Live at https://flooper.macks0554.workers.dev
  (Workers + D1, GitHub login). Verified end to end, including a picked element.
- **Point at a thing (element picker), 2026-11-04.** Visitors pick an element;
  notes carry `target: { selector, text }`. See `packages/sdk/src/picker/`.

## Not planned (for now)

- Screenshots or session replay (storage costs and privacy).
- Teams, roles and billing.

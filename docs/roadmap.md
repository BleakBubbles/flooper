# Roadmap

A rough order of what's next, and why. Nothing here is a promise; it's a
place to keep ideas so they don't get lost. Finished items move to the bottom.

## Next

### Scaling, from the surge audit (2026-11-07)

The per-site cap and the pause switch are in (see docs/operations.md). Next,
as volume grows:

- **Running counts** for the home screen's per-site summaries, instead of
  counting every note on each load.
- **Cloudflare's rate limiting binding** instead of a database write per note.
- **Indexes or limits** for sorting by site, note or page, which read every note.
- **A retention policy** for old archived notes.

### App polish

Batches 1–3 are done (see below).

## Later

### Going public (open-sourcing)

The repo went public on 2026-11-12, after a check of the full git history for
secrets and personal data. Private vulnerability reporting is on (as
`SECURITY.md` says), and the `production` environment only deploys from
`main`. Left to do:

1. Upload `design/logo/github-social-preview.png` under Settings → General →
   Social preview.
2. Optionally publish the SDK to npm as `@flooper/sdk` (claim the `@flooper`
   scope first).

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

1. **Per-page heat in the portal** (done: sorting by Page groups the notes by
   page). Still worth promoting the path to an indexed `page_path` column as
   volume grows; for now it's read from each note's context.
2. **The picker,** so notes carry selectors.
3. **"Show me on the page,"** the single-note version of review mode.
4. **Full review mode,** in three PRs:
   1. **Review links and the page API** (done, 2026-11-11). `POST
      /v1/projects/:id/review` makes a 4-hour, read-only link to the site with
      the token in the fragment (`#flooper-review=...`); the widget can then
      ask `GET /v1/ingest/:key/review?path=` (Bearer token, from the site's
      own addresses) for that page's notes, grouped by element, busiest
      first. Migration 0009 (`review_tokens`, hashed like sessions).
   2. **The overlay** (done, 2026-11-11). "Review on site" in a site's
      header (or "View on site" in its menu) opens it in a new tab in review
      mode. The widget sees the token, keeps it for the tab and loads
      `sdk/review.js` (its own file, so visitors never download it): a
      translucent pink fill on each element with notes, stronger the more it
      has (nested ones stack darker). Like DevTools' element picker, hovering
      outlines what a click opens and shows its reaction counts; clicking
      opens its notes, each linking to Flooper. A bar at the top switches
      review mode off and on, counts this page's notes against the site's,
      and exits. To fit the loader in the widget's 10 KB, its CSS variables
      get short names at build time and the launcher's logo has rounded
      coordinates (no visible change).
   3. **The rest** (done, 2026-11-12):
      - **Filter menu** (from the note count): a chip per reaction and per
        status, all on to begin with. Everything follows it, and the tab
        remembers it.
      - **The card and hover follow the page:** the card is pinned to its
        element as you scroll, and the hover updates under a still pointer.
      - **Page switcher:** the bar's path lists the site's pages with notes.
      - **Other notes panel:** notes on no element, or whose element is gone,
        in a panel you can drag and resize.
      - **Actions on hover:** read or unread, done or reopened, archived,
        using the review link (statuses only; deleting stays in the app).
        A note's Page link in the app opens review mode too.
      - **Later, maybe:** keyboard navigation between highlights, and a time
        range.

   Skipped on purpose: a list of elements in the app. Selectors are often
   unreadable (`main > div:nth-of-type(3) > button`); the overlay shows the
   element itself instead.

Production patterns it would exercise: scoped short-lived credentials,
code splitting, aggregation queries, and designing for data that drifts.

## Done

- **Emails as notes arrive, 2026-11-11.** "Emails" in Your settings is now one
  choice: Off, Daily digest, or All notes (as they arrive).
  A run every minute emails the unread notes that just came in; several close
  together come in one email, at most one every 5 minutes. Unsubscribe, bounces
  and spam reports switch either off. Migration 0008 (`users.note_emails`,
  `users.emailed_at`).
- **Drag sites to reorder, 2026-11-11.** In the sidebar, expanded or collapsed,
  or Alt+↑/↓ on a focused site; new sites join at the end. Migration 0007
  (`projects.position`), `PUT /v1/projects/order`.
- **Close the loop, 2026-11-11.** After sending a note, the widget asks "Want
  to hear back about this?" (sites can switch it off; existing sites were
  asked once). The owner replies from the note (Reply, `r`, or Reply in the
  "Marked done" toast): one email per note, from "the site's address via
  Flooper", with replies going to the owner. Left empty, it sends a standard
  line fitted to the reaction and whether it's done. Migrations 0005 and 0006.

- **Digest bounces and spam reports, 2026-11-10.** Resend's webhook switches a
  person's digest off when it bounces or is marked as spam (signed with Svix;
  see docs/operations.md). The digest's replies go to hello@flooper.app.
- **Export and delete account, 2026-11-10.** In Your settings: download every
  note (all sites or one) as a CSV, with formula-looking cells defused; and
  delete your account (type your GitHub username), which removes every site,
  note and session. The digest's checkbox now uses the app's own checkbox.
- **Selecting several notes, 2026-11-10.** A checkbox over each row's unread
  dot (on hover, and on every row while selecting); Shift-click for a range;
  select all from the selection bar or the column header. The selection bar
  offers Mark read, Mark unread, Done, Archive and Delete (Restore and Delete
  forever in Recently deleted), with one Undo per batch that puts each note
  back as it was. Keys: `x`, `Shift`+`j`/`k`, `Esc`, and `e` `d` `u` `#` act on
  the selection. Not on touch screens yet.
- **Deleting notes, 2026-11-10.** Delete in the open note (or `#`), with Undo;
  "Recently deleted" in the Show menu, with Restore and Delete forever; and
  notes deleted more than 30 days ago removed for good by the daily job. A
  `deleted_at` column (migration 0004), so a restored note keeps its status.
- **Inbox basics, 2026-11-10.** Undo (a toast with Undo, or `z`) after Done,
  Archive and Mark all as read; search over notes' text, pages and picked
  elements, centred in the header (`/`, in the URL as `?q=`); and Gmail-style
  keyboard shortcuts (j/k, Enter, Esc, e, d, u), listed under `?` and in the
  account menu. New API: `q` on `GET /v1/feedback`, `POST /v1/feedback/status`
  for several notes at once, and mark-all-read returns the notes it changed.
- **App quick wins, 2026-11-10.** A System / Light / Dark switch in the account
  menu (applied before the first paint, so no flash); a sidebar that collapses
  to a strip of site icons with unread dots (`[` toggles it); the list's sort,
  grouping by page and folded pages remembered in the browser; and "Send
  feedback" in the account menu, which opens Flooper's own widget. For that,
  the widget gained `launcher: false` (`data-launcher="false"`) to open it
  from your own button without the floating one.
- **Notes grouped by page, 2026-11-10.** Sorting by the Page column (or "By
  page" in the list's menu on smaller screens) groups the notes under their
  pages, busiest first (click again for quietest first). Each page's header
  has a bar for how busy it is, its reactions, unread count and total, and
  folds away; under it, its 3 newest notes, then "Show N more", which narrows
  the list to that page (a removable chip in the title bar). Follows the Show
  filter. New API: `GET /v1/pages`, and a `page` filter on `GET /v1/feedback`.
- **Login page on black, 2026-11-10.** The landing page's look, with the logo
  large above "Log in to Flooper" and the shared "Continue with GitHub".
- **Daily digest emails, 2026-11-07.** Opt in from the prompt above your notes or
  from "Email digest" in the account menu; one email a day (13:00 UTC) about
  new notes, by site, with one-click unsubscribe. The address comes from GitHub
  at sign-in and is yours to change. A cron trigger and Resend; see
  docs/operations.md. Next on this path: instant emails, then "close the loop".
- **Safeguards for a surge, 2026-11-07.** At most 1000 notes per site per day
  (UTC), whoever sends them, and an `INGEST_PAUSED` secret that stops all
  incoming notes without a deploy. The widget explains both. How to use them,
  and what to set up in Cloudflare: docs/operations.md.
- **Flooper on flooper.app, 2026-11-07.** The landing page runs the real widget
  (loaded on demand, never in the app), so visitors can try it; notes land in
  the `flooper.app` site.
- **Widget polish, 2026-11-07.** The launcher's creature rests as a C and turns
  up into the logo's pose on hover; its ring in dark mode is firmer (60% white);
  the picked reaction gets an outline. Site icons never load favicons from local
  or private addresses (no more "access other apps and services" prompt).
- **Landing page pass, 2026-11-07.** One section gap and the app's gutter; a
  73px header shared with the app; the note ring sizes itself to fit the first
  screen, with a "new notes" counter at the tunnel's mouth that lets go of a
  "+1" per note; the play button sits inside the ring; the DevTools claims stay
  put until clicked; a plain closing line ("Join the Feedback Loop today.").
  Signed out, the header is a single "Log in" straight to GitHub. Signed out,
  `/about` sends you to `/`, and the page names `/` as its canonical address.
- **Notes read when you click off them, 2026-11-06.** Instead of after 1.5 s
  open; clicking an empty spot on the page also closes the open note, and the
  notes list takes the note's column while none is open.

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

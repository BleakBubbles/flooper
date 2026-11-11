# Operations

What to do when Flooper is under unusual load, and the switches for it.

## Safeguards that are always on

- **Per visitor:** 10 notes a minute per visitor per site (the IP hashed with
  the site's ID, never stored raw). Over that: `429 rate_limited`, retry in
  under a minute.
- **Per site:** at most `NOTES_PER_SITE_PER_DAY` notes a day (UTC) per site,
  whoever sends them (1000, set in `apps/api/wrangler.jsonc`). Over that:
  `429 site_limit_reached` until midnight UTC. A flood from many visitors or
  many addresses stops here instead of filling an inbox and the database.
  Each refusal is logged as `site daily limit reached` with the site's ID.
- **Honeypot, origin allowlist, size limits:** see `apps/api/src/routes/ingest.ts`.

The widget only retries when told to wait 10 seconds or less, so the per-site
cap and the pause below each cost one request per note, not a burst of retries.

## Pausing incoming notes

If notes themselves are the problem (an attack, a runaway bug, the database
near its limits), stop accepting them. Everything else keeps working: the
app, the landing page, the widget script; visitors who try to send a note see
"Notes are paused for a little while."

It's a secret, not a config var, so it takes effect without a deploy and a
deploy doesn't undo it. From `apps/api`:

```bash
# Pause: enter "true" when asked.
pnpm exec wrangler secret put INGEST_PAUSED --env production

# Resume.
pnpm exec wrangler secret delete INGEST_PAUSED --env production
```

## Changing the per-site cap

Edit `NOTES_PER_SITE_PER_DAY` in both `vars` blocks of `apps/api/wrangler.jsonc`
(local and production), run `pnpm exec wrangler types` in `apps/api`, and ship
it like any change. Today's count carries on; only the limit moves.

## The daily digest

Once a day (13:00 UTC, the `triggers` cron in `apps/api/wrangler.jsonc`), each
user who turned the digest on gets one email about notes that arrived since
their last one, grouped by site, with a one-click unsubscribe. Days without new
notes send nothing. If the provider refuses an email, that user's next run
covers everything since the last one that went out.

Emails go through [Resend](https://resend.com). To switch sending on:

1. Create a Resend account and add the domain `flooper.app` (Domains → Add).
2. Add the DNS records Resend shows to the `flooper.app` zone in Cloudflare
   (DNS → Records), then wait for Resend to mark the domain verified.
3. Create an API key with "Sending access" and store it as a secret, from
   `apps/api`:

   ```bash
   pnpm exec wrangler secret put RESEND_API_KEY --env production
   ```

Without the key, digests are written to the logs instead of sent, which is how
it runs locally. Emails come from `EMAIL_FROM` (`Flooper <notes@flooper.app>`),
and replies go to `REPLY_TO` (`Flooper <hello@flooper.app>`).

Neither address is a mailbox. **Cloudflare Email Routing** (the `flooper.app`
zone → Email → Email Routing) forwards both to the owner's personal inbox, so
replies, bounces and verification codes arrive. Its MX and SPF records sit on
the bare domain; Resend's sending records are on `send.flooper.app`, so the
two don't overlap. If `REPLY_TO` changes, make sure the new address receives
mail first, or replies will bounce. To reply _as_ Flooper from Gmail, add the
address under Settings → Accounts → "Send mail as", using Resend's SMTP
(`smtp.resend.com`, port 465, user `resend`, password: a sending-only API key).
Resend's free plan sends 100 emails a day; each run sends to at most 100 users
(`USERS_PER_RUN` in `apps/api/src/digest.ts`), so raise both together.

### Bounces and spam reports

When a digest **bounces** (the address no longer exists) or someone **marks it
as spam**, Resend calls `POST /api/webhooks/resend`, and Flooper switches that
person's digest off. Mailing dead addresses, or people who complained, hurts
`flooper.app`'s standing with mail providers. The call is signed (Svix); one
that isn't, or whose timestamp is more than 5 minutes off, changes nothing.
Each switch-off is logged as `digest switched off by Resend`.

To set it up:

1. Resend dashboard → **Webhooks** → **Add endpoint**:
   `https://flooper.app/api/webhooks/resend`, with the events
   **email.bounced** and **email.complained**.
2. Copy the endpoint's **signing secret** (`whsec_...`) and store it, from
   `apps/api`:

   ```bash
   pnpm exec wrangler secret put RESEND_WEBHOOK_SECRET --env production
   ```

Until the secret is set, the endpoint answers 503 and does nothing.

To run a digest locally, with the API's dev server running (`pnpm dev`), open
`http://localhost:8787/__scheduled`; the digest is printed in its log.

## Worth setting up in Cloudflare

- **Plan:** the free Workers plan stops serving after its daily request and
  database quotas, for every site at once. The paid plan raises them by orders
  of magnitude.
- **Notifications:** usage and error-rate alerts, so a surge is noticed before
  a quota is.

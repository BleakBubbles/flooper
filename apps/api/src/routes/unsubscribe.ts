import { Hono } from "hono";
import { unsubscribeByToken } from "../db/users";
import type { AppEnv } from "../env";

/**
 * Unsubscribing from the daily digest, from the link in every email. Public:
 * it must work from a mail app with no sign-in, so the per-user random token
 * in the URL is the only key (it can do nothing but switch the digest off).
 *
 * - GET: someone clicked the link. Switch it off and say so, in plain HTML.
 * - POST: a mail app's own "Unsubscribe" button (RFC 8058 one-click, from the
 *   List-Unsubscribe-Post header). Switch it off and answer with no page.
 *
 * Both answer the same whether or not the token matched anyone, so the
 * endpoint can't be used to test tokens.
 */
export const unsubscribe = new Hono<AppEnv>();

unsubscribe.post("/:token", async (c) => {
  await unsubscribeByToken(c.env.DB, c.req.param("token"));
  return c.body(null, 204);
});

unsubscribe.get("/:token", async (c) => {
  await unsubscribeByToken(c.env.DB, c.req.param("token"));
  return c.html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Unsubscribed · Flooper</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #000; color: #ededed;
    font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 420px; padding: 24px; text-align: center; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { color: #c4c4ca; margin: 0 0 20px; }
  a { color: #ededed; }
</style>
</head>
<body>
<main>
  <h1>You're unsubscribed</h1>
  <p>No more daily emails about new notes. You can turn them back on any time from your account in Flooper.</p>
  <a href="/">Open Flooper</a>
</main>
</body>
</html>`);
});

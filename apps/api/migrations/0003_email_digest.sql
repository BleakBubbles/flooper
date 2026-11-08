-- Daily email digests. Off until the user turns them on.
--
-- email            Where digests go. Filled from the user's primary verified
--                  GitHub address at sign-in if empty; the user can change it.
-- digest_enabled   1 once they opt in.
-- digest_sent_at   When the last digest went out (ms). The next one covers
--                  notes since then, so nobody hears about a note twice.
-- unsubscribe_token  Random, per user, made at opt-in. The link in every email
--                  carries it, so unsubscribing needs no sign-in.
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN digest_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN digest_sent_at INTEGER;
ALTER TABLE users ADD COLUMN unsubscribe_token TEXT;

CREATE UNIQUE INDEX users_unsubscribe_token ON users (unsubscribe_token);
CREATE INDEX users_digest_enabled ON users (digest_enabled);

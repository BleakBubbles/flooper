-- Emails about new notes: off, a daily digest, or as notes arrive.
--
-- users.note_emails   'off', 'daily' or 'instant'. Takes over from
--                     digest_enabled (1 becomes 'daily'), which stays in the
--                     table unused, to drop in a later migration.
-- users.digest_sent_at keeps its name, but now means "emailed up to" for
--                     both kinds, so switching never sends old notes again.
-- users.emailed_at    When an email about notes last actually went out:
--                     the gap between two "as notes arrive" emails counts
--                     from here (digest_sent_at also moves on a switch).
ALTER TABLE users ADD COLUMN note_emails TEXT NOT NULL DEFAULT 'off';
ALTER TABLE users ADD COLUMN emailed_at INTEGER;
UPDATE users SET note_emails = 'daily' WHERE digest_enabled = 1;

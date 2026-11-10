-- Deleting a note: it leaves the app at once, but stays here for 30 days
-- ("Recently deleted", where it can be restored), then the daily job removes
-- it for good.
--
-- deleted_at  When it was deleted (ms), or NULL for a note that isn't. A
--             column of its own rather than a status, so a restored note
--             keeps the status it had (read, done...).
ALTER TABLE feedback ADD COLUMN deleted_at INTEGER;

-- For "Recently deleted" and the daily purge; most notes aren't deleted, so
-- only those that are go in the index.
CREATE INDEX feedback_deleted_at ON feedback (deleted_at) WHERE deleted_at IS NOT NULL;

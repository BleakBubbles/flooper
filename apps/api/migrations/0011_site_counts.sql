-- Running counts of each site's notes, so the app's sidebar (unread counts,
-- reactions, totals) reads a few rows per site instead of every note the
-- owner has ever had, on every load.
--
-- One row per site, status, reaction ('' for none) and whether the note is
-- deleted (in "Recently deleted"). The database keeps them right itself:
-- triggers on every insert, update and delete of a note, so no code path can
-- forget. Rows that reach 0 stay (and are skipped when read).
CREATE TABLE site_counts (
  project_id TEXT NOT NULL,
  status     TEXT NOT NULL,
  reaction   TEXT NOT NULL,
  deleted    INTEGER NOT NULL,
  n          INTEGER NOT NULL,
  PRIMARY KEY (project_id, status, reaction, deleted)
) WITHOUT ROWID;

-- The notes there already. (A migration runs as one transaction, so no note
-- arrives between this and the triggers.)
INSERT INTO site_counts (project_id, status, reaction, deleted, n)
SELECT project_id, status, COALESCE(reaction, ''), deleted_at IS NOT NULL, COUNT(*)
FROM feedback
GROUP BY project_id, status, COALESCE(reaction, ''), deleted_at IS NOT NULL;

-- A new note: one more in its bucket. (A retried note that's ignored as a
-- duplicate isn't inserted, so it isn't counted.)
CREATE TRIGGER site_counts_insert AFTER INSERT ON feedback
BEGIN
  INSERT OR IGNORE INTO site_counts (project_id, status, reaction, deleted, n)
  VALUES (NEW.project_id, NEW.status, COALESCE(NEW.reaction, ''), NEW.deleted_at IS NOT NULL, 0);
  UPDATE site_counts SET n = n + 1
  WHERE project_id = NEW.project_id AND status = NEW.status
    AND reaction = COALESCE(NEW.reaction, '') AND deleted = (NEW.deleted_at IS NOT NULL);
END;

-- A note gone for good (purged, its site deleted, its account deleted): one fewer.
CREATE TRIGGER site_counts_delete AFTER DELETE ON feedback
BEGIN
  UPDATE site_counts SET n = n - 1
  WHERE project_id = OLD.project_id AND status = OLD.status
    AND reaction = COALESCE(OLD.reaction, '') AND deleted = (OLD.deleted_at IS NOT NULL);
END;

-- A note moved between buckets (read, done, archived, deleted, restored):
-- one fewer in the old bucket, one more in the new.
CREATE TRIGGER site_counts_update AFTER UPDATE OF project_id, status, reaction, deleted_at ON feedback
WHEN OLD.project_id IS NOT NEW.project_id OR OLD.status IS NOT NEW.status
  OR OLD.reaction IS NOT NEW.reaction OR (OLD.deleted_at IS NULL) <> (NEW.deleted_at IS NULL)
BEGIN
  UPDATE site_counts SET n = n - 1
  WHERE project_id = OLD.project_id AND status = OLD.status
    AND reaction = COALESCE(OLD.reaction, '') AND deleted = (OLD.deleted_at IS NOT NULL);
  INSERT OR IGNORE INTO site_counts (project_id, status, reaction, deleted, n)
  VALUES (NEW.project_id, NEW.status, COALESCE(NEW.reaction, ''), NEW.deleted_at IS NOT NULL, 0);
  UPDATE site_counts SET n = n + 1
  WHERE project_id = NEW.project_id AND status = NEW.status
    AND reaction = COALESCE(NEW.reaction, '') AND deleted = (NEW.deleted_at IS NOT NULL);
END;

-- A site deleted: its counts go too (its notes were deleted first).
CREATE TRIGGER site_counts_project_delete AFTER DELETE ON projects
BEGIN
  DELETE FROM site_counts WHERE project_id = OLD.id;
END;

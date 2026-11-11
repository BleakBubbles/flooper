-- Sites in the sidebar, in the order their owner dragged them into.
--
-- projects.position   0, 1, 2... per owner. Existing sites keep the order
--                     they had (oldest first); new ones go to the end.
ALTER TABLE projects ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
UPDATE projects SET position = (
  SELECT COUNT(*) FROM projects AS earlier
  WHERE earlier.owner_id = projects.owner_id
    AND (earlier.created_at < projects.created_at
      OR (earlier.created_at = projects.created_at AND earlier.id < projects.id))
);

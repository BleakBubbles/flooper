-- Notes by page, per site. A note's page path lives inside its JSON context,
-- so finding one page's notes (review mode), grouping notes by page (the app's
-- "By page" sort) and listing a site's pages read every note of the site.
-- An index on the same expression lets those queries look the page up
-- instead. Queries must use exactly json_extract(context, '$.path') for SQLite
-- to use it.
CREATE INDEX feedback_project_path ON feedback (project_id, json_extract(context, '$.path'));

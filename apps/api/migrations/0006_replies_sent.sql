-- "Close the loop", part two: telling visitors what came of their note.
--
-- feedback.replied_at          When the owner emailed the visitor about this
--                              note ("Let them know?"), or NULL. One email per
--                              note, so it's also the guard against a second.
-- projects.reply_prompt_seen   1 once the owner has answered the one-time
--                              "Ask visitors if they want to hear back?" prompt
--                              (or set replies themselves in Site settings).
--                              Only sites with replies off ever see it.
ALTER TABLE feedback ADD COLUMN replied_at INTEGER;
ALTER TABLE projects ADD COLUMN reply_prompt_seen INTEGER NOT NULL DEFAULT 0;

-- "Close the loop": visitors can leave an email to hear back when their note
-- is dealt with.
--
-- projects.reply_requests  1 when the widget offers "Email me when it's
--                          fixed". Off (0) for sites that existed before
--                          this, so their widget doesn't change without the
--                          owner choosing; new sites start with it on.
-- feedback.contact_email   The address the visitor left for that one note,
--                          or NULL. Only ever stored when the site has
--                          reply_requests on.
ALTER TABLE projects ADD COLUMN reply_requests INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feedback ADD COLUMN contact_email TEXT;

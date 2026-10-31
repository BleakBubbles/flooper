-- Local development seed. Gives you a dev user, a project wired up to the SDK
-- playground (http://localhost:5174), and a few example notes.
-- Safe to re-run: every insert is INSERT OR IGNORE.

INSERT OR IGNORE INTO users (id, github_id, login, name, avatar_url, created_at)
VALUES ('usr_dev', 0, 'dev', 'Dev User', NULL, 1767225600000);

INSERT OR IGNORE INTO projects (id, owner_id, name, public_key, allowed_origins, created_at)
VALUES (
  'prj_playground', 'usr_dev', 'SDK Playground', 'pk_dev_playground',
  '["http://localhost:5174","http://127.0.0.1:5174"]', 1767225600000
);

INSERT OR IGNORE INTO feedback
  (id, project_id, status, reaction, message, page_url, context, idempotency_key, created_at)
VALUES
  ('fb_seed1', 'prj_playground', 'new', 'love', 'Love the colors on the homepage!',
   'http://localhost:5174/',
   '{"url":"http://localhost:5174/","path":"/","title":"Flooper playground","viewport":{"width":1440,"height":900},"language":"en-US","sdkVersion":"0.0.0"}',
   '00000000-0000-4000-8000-000000000001', 1767229200000),
  ('fb_seed2', 'prj_playground', 'new', 'idea', 'The projects section could use some filters.',
   'http://localhost:5174/projects',
   '{"url":"http://localhost:5174/projects","path":"/projects","title":"Projects","viewport":{"width":390,"height":844},"language":"en-GB","sdkVersion":"0.0.0"}',
   '00000000-0000-4000-8000-000000000002', 1767232800000),
  ('fb_seed3', 'prj_playground', 'seen', 'bug', NULL,
   'http://localhost:5174/contact',
   '{"url":"http://localhost:5174/contact","path":"/contact","viewport":{"width":1280,"height":720},"sdkVersion":"0.0.0"}',
   '00000000-0000-4000-8000-000000000003', 1767236400000);

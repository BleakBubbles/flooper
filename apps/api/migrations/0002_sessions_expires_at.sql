-- Logging in deletes expired sessions (see createSession). This index lets
-- that delete find them directly instead of scanning every session.
CREATE INDEX sessions_expires_at ON sessions (expires_at);

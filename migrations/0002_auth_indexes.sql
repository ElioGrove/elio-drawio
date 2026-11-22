CREATE INDEX IF NOT EXISTS password_sessions_expires ON password_sessions(expires);
CREATE INDEX IF NOT EXISTS password_attempts_window ON password_attempts(window);

-- Forced password rotation for accounts seeded with the fallback "admin123"
-- password. Existing users keep 0 (no forced change) so nobody is locked into
-- the change-password screen by the migration itself.
--
-- Usage:
--   sqlite3 .local/data.db ".backup .local/data-before-must-change-password.db"
--   sqlite3 .local/data.db ".read script/0003_users_must_change_password.sql"
--
-- SQLite has no ADD COLUMN IF NOT EXISTS, so re-running this file errors with
-- "duplicate column name: must_change_password" — that error means the column is
-- already there and is safe to ignore. server/models/db.ts applies the same
-- change idempotently at startup for databases that never run this script.

BEGIN TRANSACTION;

ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

COMMIT;

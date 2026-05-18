-- Per-workspace chat history.
--
-- This schema is applied to each room's `CHAT.db` file. The database file is
-- already scoped to one room, so these tables intentionally do not store a
-- `room_code` column or foreign-key back to the central `rooms` table.

CREATE TABLE IF NOT EXISTS room_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence     INTEGER NOT NULL,
  kind         TEXT    NOT NULL,
  agent        TEXT,
  content      TEXT    NOT NULL,
  detail       TEXT    NOT NULL DEFAULT '',
  success      INTEGER NOT NULL DEFAULT 0,
  timestamp    TEXT    NOT NULL,
  completed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_events_sequence
ON room_events (sequence);

CREATE INDEX IF NOT EXISTS idx_room_events_incomplete
ON room_events (sequence)
WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS room_reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence     INTEGER NOT NULL,
  content      TEXT    NOT NULL,
  started_at   TEXT    NOT NULL,
  completed_at TEXT,
  success      INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_reports_sequence
ON room_reports (sequence);

-- 0018: partial index for in-flight room_events rows.
--
-- Startup cleanup sets completed_at on any rows left null by a crash. Without
-- this index that query scans every row in the room; with it, SQLite resolves
-- the (room_code, completed_at IS NULL) predicate in a single tiny seek
-- regardless of how many completed rows the room has accumulated.

CREATE INDEX idx_room_events_incomplete
ON room_events (room_code)
WHERE completed_at IS NULL;

-- Rows are now only INSERTed into room_events when they finish streaming,
-- so status is always implicitly "done" or "failed". completed_at === null
-- on the wire signals a row that is still streaming (in-memory only).
-- Reports follow the same pattern: single INSERT at finalization.
ALTER TABLE room_events DROP COLUMN status;
ALTER TABLE room_reports DROP COLUMN status;

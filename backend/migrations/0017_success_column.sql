-- 0017: replace the `status` text column on `room_events` and
-- `room_reports` with a boolean `success` column.
--
-- Previously `status` carried three states: `streaming`, `done`, `failed`.
-- The `streaming` state is redundant: `completed_at IS NULL` already means
-- the row is still in flight. The remaining two states collapse into one
-- boolean: `success = true` means the row finished successfully, `false`
-- means it failed.
--
-- Migration steps (same for both tables):
-- 1. Add `success BOOLEAN NOT NULL DEFAULT 0` (false = in-flight / failed).
-- 2. Backfill `success = 1` for every row that was previously `done`.
--    Rows with `status = 'failed'` or `status = 'streaming'` keep the
--    default 0 — correct for failed rows; in-flight rows never survive a
--    restart anyway.
-- 3. Drop the now-redundant `status` column.

ALTER TABLE room_events
ADD COLUMN success BOOLEAN NOT NULL DEFAULT 0;

UPDATE room_events
SET success = 1
WHERE status = 'done';

ALTER TABLE room_events
DROP COLUMN status;

ALTER TABLE room_reports
ADD COLUMN success BOOLEAN NOT NULL DEFAULT 0;

UPDATE room_reports
SET success = 1
WHERE status = 'done';

ALTER TABLE room_reports
DROP COLUMN status;

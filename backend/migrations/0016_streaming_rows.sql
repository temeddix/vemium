-- 0016: unify drafts and finalized rows into a single streamable row model.
--
-- Every row in `room_events` now carries its own lifecycle state. Reasoning
-- is no longer threaded onto the bubble row that produced it - the
-- orchestrator emits a separate `thinking` row per reasoning burst, alongside
-- the bubble (`agent_chat` / `leader_note`) and tool-call (`inline_note`)
-- rows. This makes the chat timeline a flat sequence of independently
-- streamable events that can interleave freely within one persona turn.
--
-- Schema changes:
--
-- 1. `room_events.reasoning` is dropped. Thinking traces live in `detail`
--    on rows of the new `thinking` kind.
-- 2. `room_events.status` (TEXT NOT NULL DEFAULT 'done'):
--    `streaming` | `done` | `failed`. Existing rows are backfilled to
--    `done` so the snapshot keeps rendering the historical log unchanged.
-- 3. `room_events.completed_at` (TEXT NULL): ISO timestamp filled when
--    the row finishes streaming. Null while `status = 'streaming'`.
--    Existing rows backfill to their `timestamp` so the "Took N seconds"
--    label resolves to zero on legacy data.
--
-- A new `room_events.kind` value `thinking` is introduced. `kind` is a
-- free-form TEXT column so no constraint change is needed.

ALTER TABLE room_events
DROP COLUMN reasoning;

ALTER TABLE room_events
ADD COLUMN status TEXT NOT NULL DEFAULT 'done';

ALTER TABLE room_events
ADD COLUMN completed_at TEXT NULL;

UPDATE room_events
SET completed_at = timestamp
WHERE completed_at IS NULL;

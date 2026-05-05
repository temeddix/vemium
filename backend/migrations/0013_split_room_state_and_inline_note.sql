-- 0013: split room lifecycle into two orthogonal states and persist inline
-- notes.
--
-- Schema changes:
--
-- 1. `rooms.status` (a single tri-state: active/paused/failed) is replaced
--    by two orthogonal columns:
--    - `room_state` (`active` | `deactivated`): user-controlled. The
--      strongest gate; when deactivated the orchestrator loop is stopped
--      regardless of what the leader thinks.
--    - `debate_state` (`running` | `paused`): leader-controlled. Flipped
--      by `pause_room` / `resume_room` (formerly `halt_room` /
--      `proceed_room`) and by the auto-pause-on-converge gate.
--    The legacy `failed` value is dropped because nothing in the codebase
--    ever set it.
-- 2. `room_events.detail` (TEXT NOT NULL DEFAULT ''): click-to-reveal
--    payload for `inline_note` rows. Empty string for every other kind.
--    Adding the column rather than overloading `reasoning` keeps the
--    semantics (chain-of-thought vs inline-note expansion) clean.
--
-- A new `room_events.kind` value `inline_note` is introduced (no schema
-- change - `kind` is already a free-form TEXT discriminator). Inline
-- notes used to be stream-only WebSocket events; they are now persisted
-- alongside chat bubbles so a page refresh restores them.

ALTER TABLE rooms
ADD COLUMN room_state TEXT NOT NULL DEFAULT 'active';

ALTER TABLE rooms
ADD COLUMN debate_state TEXT NOT NULL DEFAULT 'running';

-- Map the legacy single-status column. We assume historical `paused`
-- rooms were leader-paused (the more permissive interpretation: the
-- user can always deactivate later, but starting deactivated would lock
-- rooms out of the resume schedule until the user notices).
UPDATE rooms
SET
  room_state = 'active',
  debate_state = CASE
    WHEN status = 'paused' THEN 'paused'
    ELSE 'running'
  END;

ALTER TABLE rooms
DROP COLUMN status;

ALTER TABLE room_events
ADD COLUMN detail TEXT NOT NULL DEFAULT '';

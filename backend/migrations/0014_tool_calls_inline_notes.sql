-- 0014: drop the inline `tool_calls` column from `room_events`.
--
-- Tool invocations no longer ride along on the assistant message row that
-- triggered them. Every tool call now produces its own `inline_note` row
-- (the `room_events.kind` value introduced in 0013), with the tool's
-- short label in `content` and any rich expansion in `detail`. This keeps
-- chat bubbles focused on the model's natural-language reply and reasoning,
-- and gives every tool a uniform persistence path.
--
-- Reasoning stays inline on the message row: the streaming UI relies on
-- in-place token deltas during a draft, and persisting the trace alongside
-- the bubble is the easiest way to round-trip that experience across page
-- reloads.

ALTER TABLE room_events
DROP COLUMN tool_calls;

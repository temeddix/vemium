-- 0015: drop the convergence-based auto-pause column.
--
-- Pause is now decided exclusively by the leader, either during the
-- periodic steering tick or in response to a debater calling
-- `request_leader_decision`. The "all personas signaled idle" tracking
-- inside the orchestrator is gone, so the per-room toggle that gated
-- that behavior no longer has a meaningful effect.
--
-- The wake-on-cron resume path (`resume_schedule_cron` /
-- `resume_schedule_label`) is unchanged; it still drives the leader's
-- resume gate while the room is paused.

ALTER TABLE rooms
DROP COLUMN auto_pause_when_converged;

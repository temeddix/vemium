-- 0020: store room and debate states in UPPER_SNAKE_CASE.
--
-- The states are written the way their JSON is spelled. Reading still
-- accepts the old lowercase values, so this only normalizes existing rows.

UPDATE rooms
SET
  room_state = UPPER(room_state),
  debate_state = UPPER(debate_state);

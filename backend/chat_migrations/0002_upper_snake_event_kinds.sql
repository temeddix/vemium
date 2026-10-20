-- Store event kinds in UPPER_SNAKE_CASE.
--
-- Kinds are written the way their JSON is spelled. Reading still accepts the
-- old lowercase values, so this only normalizes existing rows, which the
-- summary lookup filters on.

UPDATE room_events
SET kind = UPPER(kind);

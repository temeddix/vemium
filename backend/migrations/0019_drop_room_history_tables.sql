-- 0019: move room-local history to per-workspace CHAT.db files.
--
-- From this migration onward, the central `vemium.db` only stores global app
-- metadata such as rooms and app settings. Existing deployments should copy
-- `room_events` and `room_reports` into each workspace's `CHAT.db` before
-- applying this migration.

DROP TABLE IF EXISTS room_events;
DROP TABLE IF EXISTS room_reports;

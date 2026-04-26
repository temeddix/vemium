ALTER TABLE run_settings ADD COLUMN chat_turns INTEGER NOT NULL DEFAULT 8;
ALTER TABLE run_settings ADD COLUMN schedule_cron TEXT NOT NULL DEFAULT '';

UPDATE run_settings
SET chat_turns = CASE
  WHEN chat_turns > 0 THEN chat_turns
  ELSE 1
END;

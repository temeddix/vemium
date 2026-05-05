ALTER TABLE rooms
ADD COLUMN auto_pause_when_converged INTEGER NOT NULL DEFAULT 0;

ALTER TABLE rooms
ADD COLUMN resume_schedule_cron TEXT NOT NULL DEFAULT '0 * * * *';

ALTER TABLE rooms
ADD COLUMN resume_schedule_label TEXT NOT NULL DEFAULT 'Every hour';

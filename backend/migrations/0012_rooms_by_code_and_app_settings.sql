-- 0012: rooms keyed by readable code; provider configs become global.
--
-- Schema rewrite:
-- - `rooms.id` (UUID) and `rooms.slug` collapse into a single `code` column,
--   a Google-Meet style 10-letter id formatted `xxx-xxxx-xxx`. The code is
--   the room's primary key, the URL segment, and the workspace directory
--   name.
-- - `rooms.name` is removed; the UI uses `topic` as the display label.
-- - `rooms.background` is folded into `instruction` (the two fields had
--   overlapping intent in practice).
-- - `rooms.low_provider_config` and `rooms.high_provider_config` move out
--   of the room and into a process-global `app_settings` row. The first
--   existing room's tier configuration is promoted; rooms that came after
--   it lose their per-room override.
-- - `rooms.report_interval_seconds` becomes a cron-driven schedule
--   (`report_schedule_cron` + `report_schedule_label`).
--
-- Tables `room_events` and `room_reports` are also rebuilt because their
-- foreign key column type changes (UUID text -> code text).

-- Process-wide tier configuration. Single row enforced by the CHECK on id.
CREATE TABLE app_settings (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  low_provider_config  TEXT NOT NULL,
  high_provider_config TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

-- Promote the oldest room's tier configuration. If the database has no
-- rooms yet, fall back to an empty Ollama-shaped placeholder so the row
-- always exists.
INSERT INTO app_settings (id, low_provider_config, high_provider_config, updated_at)
SELECT
  1,
  COALESCE(
    (SELECT low_provider_config FROM rooms ORDER BY created_at ASC LIMIT 1),
    '{"model":"","baseUrl":"http://localhost:11434","apiKey":null,"apiType":"ollama"}'
  ),
  COALESCE(
    (SELECT high_provider_config FROM rooms ORDER BY created_at ASC LIMIT 1),
    '{"model":"","baseUrl":"http://localhost:11434","apiKey":null,"apiType":"ollama"}'
  ),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- Map every old UUID to a freshly-generated readable code so we can rewrite
-- the foreign-key columns in dependent tables. Each `new_code` is a 10-letter
-- `xxx-xxxx-xxx` value drawn from the lowercase Latin alphabet.
CREATE TEMP TABLE id_map (
  old_id   TEXT PRIMARY KEY NOT NULL,
  new_code TEXT NOT NULL UNIQUE
);

INSERT INTO id_map (old_id, new_code)
SELECT
  id,
  substr('abcdefghijklmnopqrstuvwxyz', (abs(random()) % 26) + 1, 1)
    || substr('abcdefghijklmnopqrstuvwxyz', (abs(random()) % 26) + 1, 1)
    || substr('abcdefghijklmnopqrstuvwxyz', (abs(random()) % 26) + 1, 1)
    || '-'
    || substr('abcdefghijklmnopqrstuvwxyz', (abs(random()) % 26) + 1, 1)
    || substr('abcdefghijklmnopqrstuvwxyz', (abs(random()) % 26) + 1, 1)
    || substr('abcdefghijklmnopqrstuvwxyz', (abs(random()) % 26) + 1, 1)
    || substr('abcdefghijklmnopqrstuvwxyz', (abs(random()) % 26) + 1, 1)
    || '-'
    || substr('abcdefghijklmnopqrstuvwxyz', (abs(random()) % 26) + 1, 1)
    || substr('abcdefghijklmnopqrstuvwxyz', (abs(random()) % 26) + 1, 1)
    || substr('abcdefghijklmnopqrstuvwxyz', (abs(random()) % 26) + 1, 1)
FROM rooms;

-- New rooms table: code-keyed, no per-room provider configs, cron-based
-- report schedule.
CREATE TABLE rooms_new (
  code                       TEXT PRIMARY KEY NOT NULL,
  topic                      TEXT    NOT NULL,
  goal                       TEXT    NOT NULL,
  instruction                TEXT,
  status                     TEXT    NOT NULL,
  chat_interval_seconds      INTEGER NOT NULL,
  steering_interval_seconds  INTEGER NOT NULL,
  report_schedule_cron       TEXT    NOT NULL,
  report_schedule_label      TEXT    NOT NULL,
  python_timeout_seconds     INTEGER NOT NULL,
  auto_pause_when_converged  INTEGER NOT NULL DEFAULT 0,
  resume_schedule_cron       TEXT    NOT NULL,
  resume_schedule_label      TEXT    NOT NULL,
  created_at                 TEXT    NOT NULL,
  updated_at                 TEXT    NOT NULL
);

INSERT INTO rooms_new (
  code, topic, goal, instruction, status,
  chat_interval_seconds, steering_interval_seconds,
  report_schedule_cron, report_schedule_label,
  python_timeout_seconds, auto_pause_when_converged,
  resume_schedule_cron, resume_schedule_label,
  created_at, updated_at
)
SELECT
  m.new_code,
  r.topic,
  r.goal,
  CASE
    WHEN COALESCE(TRIM(r.background), '') = '' THEN r.instruction
    WHEN COALESCE(TRIM(r.instruction), '') = '' THEN r.background
    ELSE r.instruction || char(10) || char(10) || r.background
  END,
  r.status,
  r.chat_interval_seconds,
  r.steering_interval_seconds,
  '0 9 * * *',
  'Every day at 09:00 UTC',
  r.python_timeout_seconds,
  r.auto_pause_when_converged,
  r.resume_schedule_cron,
  r.resume_schedule_label,
  r.created_at,
  r.updated_at
FROM rooms r
JOIN id_map m ON m.old_id = r.id;

-- Rebuild room_events with the code-typed FK.
CREATE TABLE room_events_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code  TEXT    NOT NULL,
  sequence   INTEGER NOT NULL,
  kind       TEXT    NOT NULL,
  agent      TEXT,
  content    TEXT    NOT NULL,
  reasoning  TEXT    NOT NULL DEFAULT '',
  tool_calls TEXT    NOT NULL DEFAULT '[]',
  timestamp  TEXT    NOT NULL,
  FOREIGN KEY (room_code) REFERENCES rooms_new (code) ON DELETE CASCADE
);

INSERT INTO room_events_new (
  id, room_code, sequence, kind, agent, content, reasoning, tool_calls, timestamp
)
SELECT
  e.id, m.new_code, e.sequence, e.kind, e.agent,
  e.content, e.reasoning, e.tool_calls, e.timestamp
FROM room_events e
JOIN id_map m ON m.old_id = e.room_id;

-- Rebuild room_reports likewise.
CREATE TABLE room_reports_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code    TEXT    NOT NULL,
  sequence     INTEGER NOT NULL,
  content      TEXT    NOT NULL,
  started_at   TEXT    NOT NULL,
  completed_at TEXT,
  status       TEXT    NOT NULL,
  FOREIGN KEY (room_code) REFERENCES rooms_new (code) ON DELETE CASCADE
);

INSERT INTO room_reports_new (
  id, room_code, sequence, content, started_at, completed_at, status
)
SELECT
  r.id, m.new_code, r.sequence, r.content, r.started_at, r.completed_at, r.status
FROM room_reports r
JOIN id_map m ON m.old_id = r.room_id;

-- Swap the old tables out. Drop dependent tables first so the FKs to the
-- legacy `rooms.id` column do not block the parent drop.
DROP TABLE room_events;
DROP TABLE room_reports;
DROP TABLE rooms;

ALTER TABLE rooms_new        RENAME TO rooms;
ALTER TABLE room_events_new  RENAME TO room_events;
ALTER TABLE room_reports_new RENAME TO room_reports;

CREATE INDEX idx_room_events_room_seq  ON room_events  (room_code, sequence);
CREATE INDEX idx_room_reports_room_seq ON room_reports (room_code, sequence);

DROP TABLE id_map;

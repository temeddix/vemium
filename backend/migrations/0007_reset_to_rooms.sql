-- Fresh start. Drop the legacy single-shot "Run" model and replace it with the
-- new "Room" model: each room is one endless debate on a subject, with its own
-- per-room settings (including provider configuration) and its own pause/resume
-- lifecycle. The previous tables are dropped because there is no production
-- data worth migrating yet.

DROP TABLE IF EXISTS run_events;
DROP TABLE IF EXISTS run_settings;
DROP TABLE IF EXISTS runs;

-- A `rooms` row is the canonical record of a single debate subject.
--
-- - `slug` is a filesystem-safe stable identifier used as the directory name
--   under `/data/debate/<slug>/`.
-- - `low_provider_config` and `high_provider_config` are JSON blobs encoding
--   `ProviderConfig` (see backend `models.rs`). API keys are stored in plain
--   text for now; the volume is private to the deployment.
-- - `status` is `'active' | 'paused' | 'failed'`. Rooms are endless: there is
--   no `'completed'`. A room only stops when paused, deleted, or failed.
CREATE TABLE rooms (
    id                          TEXT    PRIMARY KEY NOT NULL,
    name                        TEXT    NOT NULL,
    slug                        TEXT    NOT NULL UNIQUE,
    topic                       TEXT    NOT NULL,
    goal                        TEXT    NOT NULL,
    instruction                 TEXT,
    background                  TEXT,
    status                      TEXT    NOT NULL,
    chat_interval_seconds       INTEGER NOT NULL,
    evaluation_interval_seconds INTEGER NOT NULL,
    report_interval_seconds     INTEGER NOT NULL,
    python_timeout_seconds      INTEGER NOT NULL,
    python_feedback_every       INTEGER NOT NULL,
    low_provider_config         TEXT    NOT NULL,
    high_provider_config        TEXT    NOT NULL,
    created_at                  TEXT    NOT NULL,
    updated_at                  TEXT    NOT NULL
);

-- An append-only log of everything visible in the UI for a room. Per-token
-- streaming deltas are *not* persisted; only completed turns and tool results
-- land here. On WebSocket reconnect, the history is the union of these rows
-- plus any in-flight turn buffer.
--
-- `kind` is one of: `'agent_chat' | 'leader_note' | 'tool_call' | 'phase' | 'system'`.
-- `content` is plain text for chat/leader/phase/system, JSON for `tool_call`.
CREATE TABLE room_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id    TEXT    NOT NULL,
    sequence   INTEGER NOT NULL,
    kind       TEXT    NOT NULL,
    agent      TEXT,
    content    TEXT    NOT NULL,
    timestamp  TEXT    NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE
);

CREATE INDEX idx_room_events_room_seq ON room_events (room_id, sequence);

-- Periodic leader reports are first-class records, separate from the chat log,
-- so the UI can list them independently. `status` lets the UI render an
-- in-progress report while tokens stream in.
CREATE TABLE room_reports (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id      TEXT    NOT NULL,
    sequence     INTEGER NOT NULL,
    content      TEXT    NOT NULL,
    started_at   TEXT    NOT NULL,
    completed_at TEXT,
    status       TEXT    NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE
);

CREATE INDEX idx_room_reports_room_seq ON room_reports (room_id, sequence);

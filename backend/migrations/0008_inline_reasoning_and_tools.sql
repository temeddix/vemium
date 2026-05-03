-- Reshape `room_events` so a single `agent_chat` / `leader_note` row owns the
-- full message: text content, the model's reasoning trace, and every tool
-- call invoked during the turn (inline JSON). The previous design persisted
-- `tool_call` events as separate rows interleaved by sequence, which forced
-- the UI to reassemble messages from a multi-row stream and made the
-- streaming protocol leak the assembly order to the wire format.
--
-- This is a clean break: the new draft / message WebSocket protocol assumes
-- one row per finalized message and reasoning embedded in it. There is no
-- production data worth migrating, so we drop the room timeline tables and
-- recreate them.

DROP INDEX IF EXISTS idx_room_reports_room_seq;
DROP INDEX IF EXISTS idx_room_events_room_seq;
DROP TABLE IF EXISTS room_reports;
DROP TABLE IF EXISTS room_events;
DROP TABLE IF EXISTS rooms;

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

-- Append-only message log. `kind` is `'agent_chat' | 'leader_note' | 'system'`.
-- - `content`     : final user-visible text.
-- - `reasoning`   : the model's chain-of-thought; empty string when the
--                   model emitted none (or the turn is a `system` message).
-- - `tool_calls`  : JSON array of `ToolCallRecord` objects executed during
--                   this turn, in invocation order. `'[]'` when no tools
--                   were called or the turn is not an assistant turn.
CREATE TABLE room_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id    TEXT    NOT NULL,
    sequence   INTEGER NOT NULL,
    kind       TEXT    NOT NULL,
    agent      TEXT,
    content    TEXT    NOT NULL,
    reasoning  TEXT    NOT NULL DEFAULT '',
    tool_calls TEXT    NOT NULL DEFAULT '[]',
    timestamp  TEXT    NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE
);

CREATE INDEX idx_room_events_room_seq ON room_events (room_id, sequence);

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

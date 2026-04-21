CREATE TABLE IF NOT EXISTS run_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id     TEXT    NOT NULL,
    sequence   INTEGER NOT NULL,
    event_type TEXT    NOT NULL,
    agent      TEXT,
    content    TEXT    NOT NULL,
    timestamp  TEXT    NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE INDEX IF NOT EXISTS idx_run_events_run_id ON run_events (run_id);

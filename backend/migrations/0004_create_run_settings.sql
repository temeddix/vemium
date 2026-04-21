CREATE TABLE IF NOT EXISTS run_settings (
    kind             TEXT    PRIMARY KEY NOT NULL,
    topic            TEXT    NOT NULL,
    goal             TEXT    NOT NULL,
    instruction      TEXT    NOT NULL,
    background       TEXT    NOT NULL,
    interval_seconds INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL,
    run_forever      INTEGER NOT NULL,
    updated_at       TEXT    NOT NULL
);

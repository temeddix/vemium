CREATE TABLE IF NOT EXISTS runs (
    id               TEXT    PRIMARY KEY NOT NULL,
    kind             TEXT    NOT NULL,
    status           TEXT    NOT NULL,
    topic            TEXT    NOT NULL,
    goal             TEXT    NOT NULL,
    instruction      TEXT,
    background       TEXT,
    interval_seconds INTEGER NOT NULL DEFAULT 0,
    rounds           INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
);

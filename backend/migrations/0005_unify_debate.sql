UPDATE runs SET kind = 'discussion' WHERE kind = 'weekly_report';

DROP TABLE IF EXISTS run_settings;
CREATE TABLE IF NOT EXISTS run_settings (
    kind             TEXT    PRIMARY KEY NOT NULL,
    topic            TEXT    NOT NULL,
    goal             TEXT    NOT NULL,
    instruction      TEXT    NOT NULL,
    background       TEXT    NOT NULL,
    interval_minutes INTEGER NOT NULL,
    turns            INTEGER NOT NULL,
    autorun          INTEGER NOT NULL,
    updated_at       TEXT    NOT NULL
);

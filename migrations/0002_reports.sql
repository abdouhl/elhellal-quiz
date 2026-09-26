-- How many players flagged each question as wrong or unclear.
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    n INTEGER NOT NULL DEFAULT 0
);

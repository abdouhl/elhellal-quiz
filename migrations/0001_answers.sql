-- How many players answered each question, and how many got it right.
CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    n INTEGER NOT NULL DEFAULT 0,
    ok INTEGER NOT NULL DEFAULT 0
);

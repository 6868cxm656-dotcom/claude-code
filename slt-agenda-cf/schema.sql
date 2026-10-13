-- SLT scoreboard — database schema for Cloudflare D1.
--
-- You don't normally need to run this: the API creates the table itself on
-- first use (see ensureSchema in functions/_shared.js). It's here for reference
-- and for setting up a database by hand.
--
-- Everything lives in one table. Each record belongs to a collection (c), may
-- be filed under a parent record (a meeting or an objective), and keeps its
-- fields as JSON in `data`.

CREATE TABLE IF NOT EXISTS records (
  id         TEXT PRIMARY KEY,
  c          TEXT NOT NULL,
  parent     TEXT,
  position   REAL NOT NULL DEFAULT 0,
  data       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_records_c ON records(c);
CREATE INDEX IF NOT EXISTS idx_records_parent ON records(parent);

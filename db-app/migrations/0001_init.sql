-- TCF Risk Register — shared database schema (Cloudflare D1 / SQLite)
-- The full risk object (incl. history, flag, pending) is stored as JSON in `data`,
-- keeping the front-end data shape byte-identical to the single-file version.
-- Indexed columns exist only for filtering and concurrency.

CREATE TABLE IF NOT EXISTS risks (
  id          TEXT PRIMARY KEY,
  committee   TEXT,
  l2          TEXT,
  updated     TEXT,            -- ISO timestamp, used for optimistic concurrency
  pending_new INTEGER DEFAULT 0,
  data        TEXT NOT NULL    -- full risk JSON
);

CREATE TABLE IF NOT EXISTS deleted (
  id         TEXT PRIMARY KEY,
  deleted_at TEXT,
  data       TEXT NOT NULL     -- full tombstone JSON (incl. deletedBy)
);

CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL              -- JSON: {emails, schedules, updated}
);

CREATE INDEX IF NOT EXISTS idx_risks_committee ON risks(committee);
CREATE INDEX IF NOT EXISTS idx_risks_l2 ON risks(l2);

-- SLT Agenda — database schema for Cloudflare D1
-- Apply with:  npm run db:remote   (and  npm run db:local  for local dev)

CREATE TABLE IF NOT EXISTS meetings (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT 'Senior Leadership Team',
  date        TEXT NOT NULL,
  start       TEXT NOT NULL DEFAULT '09:00',
  target      INTEGER NOT NULL DEFAULT 60,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  meeting_id  TEXT NOT NULL,
  position    INTEGER NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'discussion',
  minutes     INTEGER NOT NULL DEFAULT 0,
  owner       TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo',
  standing    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS actions (
  id        TEXT PRIMARY KEY,
  item_id   TEXT NOT NULL,
  position  INTEGER NOT NULL,
  text      TEXT NOT NULL DEFAULT '',
  owner     TEXT NOT NULL DEFAULT '',
  done      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_items_meeting ON items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_actions_item ON actions(item_id);

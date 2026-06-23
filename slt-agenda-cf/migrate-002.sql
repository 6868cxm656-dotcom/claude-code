-- Migration: add meeting type, label, and recording/transcript fields.
-- Run this ONCE against your existing database (it's safe — only adds columns).
-- In the Cloudflare dashboard: open your slt-agenda D1 database, go to the
-- Console tab, paste these four lines, and Run.

ALTER TABLE meetings ADD COLUMN kind TEXT NOT NULL DEFAULT 'slt';
ALTER TABLE meetings ADD COLUMN label TEXT NOT NULL DEFAULT '';
ALTER TABLE meetings ADD COLUMN recording_url TEXT NOT NULL DEFAULT '';
ALTER TABLE meetings ADD COLUMN transcript TEXT NOT NULL DEFAULT '';

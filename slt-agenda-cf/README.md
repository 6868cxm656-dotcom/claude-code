# SLT Scoreboard

A thematic-goal scoreboard and meeting rhythm for a senior leadership team,
following the Table Group model (*The Advantage*, *Death by Meeting*). Runs on
Cloudflare Pages with a D1 database.

The app ships empty. Your goal, objectives, tasks and playbook are loaded from
a private import file, so none of it lives in this (public) repository.

## What's in it

| Tab | What it's for |
| --- | --- |
| **Scoreboard** | The thematic goal, defining objectives with owners, on track / at risk / off track status with a one-line reason and an 8-week trend, success statements, key tasks (who, when, due), and standard operating objectives. Missing owners, dates and success statements are highlighted; overdue tasks are flagged. |
| **Meetings** | The meeting rhythm over the next three months: weekly tacticals (with a rotating chair), strategic meetings (fortnightly twice, then every four weeks), off-sites, Board and subcommittee dates. Drag topics between meetings, or between a meeting and the car park. |
| **Meeting page** | Weekly tactical: lightning round → scoreboard review (red goes straight on the agenda; open actions reviewed) → agenda with a time budget → strategic car park → decisions (with a fist-of-five commitment check) and actions → will say / won't say. Strategic: topics with owner, pre-read, BLUF, the conflict triangle and the Working Genius needed, ending in logged decisions. Every meeting can hold a Granola link and transcript. |
| **Car park** | Strategic topics waiting for a slot, ranked by urgency and importance, plus the potential not-do list. |
| **Actions** | Every open action across meetings, grouped by owner, and the decisions log. |
| **Playbook** | The six clarity questions, values, strategic anchors, meeting rhythm, conflict rules, Working Genius map and team-health scores. All editable. |
| **Settings** | Team members, goal, import and backup. |

Status updates are kept week by week, so the trend shows who updated and when.
Pick your name at the top of the page so your edits are signed; once Cloudflare
Access is on, the signed-in email is used instead.

## Deploying

The Pages project builds from this folder (root directory `slt-agenda-cf`,
output directory `public`, no build command). The D1 binding is in
`wrangler.toml`. The database table creates itself on first use — there's no
SQL to run.

**Before importing anything sensitive, switch on Cloudflare Access:**
Cloudflare dashboard → Zero Trust → Access → Applications → Add an application
→ Self-hosted. Add the site's domain (e.g. `your-project.pages.dev`) and
`*.your-project.pages.dev` (preview deployments), with a policy that allows
only your team's email addresses. Until then the site shows a warning banner.

## Local development

```bash
npm install
npm run dev          # http://localhost:8788
```

## Data

Everything is stored in one `records` table (see `schema.sql`): each record has
a collection, an optional parent (a meeting or objective) and its fields as
JSON. The API is in `functions/api/records`:

- `GET /api/records` — all records
- `POST /api/records` — create or replace one record, or `{ records: [...] }`
- `PATCH /api/records/:id` — merge changed fields (objective status changes are logged per week)
- `DELETE /api/records/:id` — delete a record and anything filed under it

Use **Settings → Download backup** for a full export; the same file can be
imported again.

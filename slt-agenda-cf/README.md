# SLT Agenda — Cloudflare edition

A shared weekly agenda planner for the Senior Leadership Team. Everyone opens
one URL and edits the same agendas, stored in a real database. Locked to your
team's email addresses with Cloudflare Access.

## How it's built

| Piece | What it does |
| --- | --- |
| **Cloudflare Pages** | Hosts the page at a proper URL (`public/index.html`). |
| **Pages Functions** | A small API under `functions/api/` that the page calls. |
| **Cloudflare D1** | A SQLite database holding meetings, items, and actions. |
| **Cloudflare Access** | Restricts the whole app to approved email addresses. |

Everything saves automatically to the shared database, so there's no file to
pass around.

## Features

Same as the lightweight version: timed running order with a capacity meter,
inline editing, drag-to-reorder, decisions and actions, done / carry-forward,
weekly roll-forward (keeps standing and carried items), plus a meeting switcher,
"Copy for email", and "Print / PDF". Every save records who last edited it.

## One-time deployment

You'll need a Cloudflare account and Node.js installed. Run these from this
`slt-agenda-cf/` folder.

```bash
# 1. Install tooling (Wrangler is the Cloudflare CLI)
npm install

# 2. Sign in to Cloudflare
npx wrangler login

# 3. Create the database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create slt-agenda

# 4. Create the tables in the live database
npm run db:remote

# 5. Deploy (first run creates the Pages project; follow the prompts)
npm run deploy
```

Wrangler prints your live URL, e.g. `https://slt-agenda.pages.dev`.

### Lock it to your team (Cloudflare Access)

1. In the Cloudflare dashboard, open **Zero Trust → Access → Applications**.
2. **Add an application → Self-hosted**, and point it at your Pages domain
   (e.g. `slt-agenda.pages.dev`).
3. Add a **policy**: Action *Allow*, and include the SLT email addresses (or your
   whole `@churchillfellowship.org` domain).
4. Save. From then on, visitors sign in first, and the app shows who's editing.

## Local development

```bash
npm run db:local   # create the tables in a local test database
npm run dev        # serves the app + API at http://localhost:8788
```

When running locally there's no Cloudflare Access, so edits are attributed to
`you@local`.

## Notes & limits

- Saving replaces the whole meeting (last edit wins). Fine for a small team where
  one person usually drives; it does not do live, character-by-character
  co-editing.
- A plain backup of the data any time:
  `npx wrangler d1 execute slt-agenda --remote --command "SELECT * FROM meetings"`

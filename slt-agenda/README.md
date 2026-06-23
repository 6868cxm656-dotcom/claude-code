# SLT Agenda

A lightweight weekly agenda planner for Senior Leadership Team meetings. One
self-contained page — no install, no accounts, no backend.

## What it does

- **Timed running order.** Set a start time and meeting length; each item shows
  the clock time it begins, and a capacity meter warns when you've planned more
  than the meeting can hold.
- **Quick to add and edit.** Title, owner, duration, and type
  (Update / Decision / Discussion / Info) all edit inline. Drag the handle to
  reorder.
- **Decisions & actions.** Capture notes against any item and add actions with
  an owner and a tick box.
- **Done / carry forward.** Tick items off, or mark unfinished ones to carry to
  next week.
- **Weekly roll-forward.** One click starts next week's agenda — keeps standing
  items, carried items, and any open actions, and advances the date by 7 days.
- **Share via a file.** It auto-saves in your browser. To share with the team,
  use **Save to file** and keep the `.json` on your shared drive (SharePoint /
  OneDrive). Anyone can **Open…** it, edit, and save it back.
- **Export.** **Copy for email** puts a clean plain-text agenda on your
  clipboard; **Print / PDF** produces a tidy printable agenda or minutes.

## Using it

Just open `index.html` in a browser, or visit the deployed URL.

## Deploying to a URL

A GitHub Actions workflow (`.github/workflows/deploy-slt-agenda.yml`) publishes
this folder to GitHub Pages on every push.

To enable it once: in the repository, go to **Settings → Pages → Build and
deployment → Source** and choose **GitHub Actions**. The next push that touches
`slt-agenda/` will deploy, and the live URL appears in the Actions run summary.

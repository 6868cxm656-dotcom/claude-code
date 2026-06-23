import { json, getEmail, insertMeeting, standingSeed } from "../_shared.js";

// POST /api/schedule — create a run of weekly meetings.
// Body: { fromDate, weeks?, start?, target?, title?, kind? }
// Skips any date that already has a meeting of the same kind, so it's safe to re-run.
export const onRequestPost = async ({ request, env }) => {
  const body = await request.json().catch(() => ({}));
  const weeks = Math.min(26, Math.max(1, parseInt(body.weeks, 10) || 13));
  const start = body.start || "09:00";
  const target = parseInt(body.target, 10) || 120;
  const title = body.title || "Senior Leadership Team";
  const kind = ["slt", "board", "subcommittee", "team"].includes(body.kind) ? body.kind : "slt";
  const email = getEmail(request);

  const base = body.fromDate || new Date().toISOString().slice(0, 10);
  const d = new Date(base + "T00:00:00");
  if (isNaN(d.getTime())) return json({ error: "Bad date" }, 400);

  let created = 0;
  for (let i = 0; i < weeks; i++) {
    const iso = d.toISOString().slice(0, 10);
    const exists = await env.DB.prepare("SELECT id FROM meetings WHERE date = ? AND kind = ?")
      .bind(iso, kind).first();
    if (!exists) {
      await insertMeeting(env.DB, { title, date: iso, start, target, kind, items: standingSeed() }, email);
      created++;
    }
    d.setDate(d.getDate() + 7);
  }

  return json({ created });
};

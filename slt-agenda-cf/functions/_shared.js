// Shared helpers for the SLT Agenda API (Cloudflare Pages Functions + D1).
// Files prefixed with "_" are not routed, but can be imported by route files.

const TYPES = ["update", "decision", "discussion", "info"];
const STATUS = ["todo", "done", "carry"];

// Cloudflare Access injects the signed-in user's email at the edge.
// Locally (wrangler dev) the header is absent, so fall back to a placeholder.
export function getEmail(request) {
  return request.headers.get("Cf-Access-Authenticated-User-Email") || "you@local";
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Load a full meeting (with its items and their actions) as the shape the UI uses.
export async function loadMeeting(db, id) {
  const meeting = await db.prepare("SELECT * FROM meetings WHERE id = ?").bind(id).first();
  if (!meeting) return null;

  const items = (await db
    .prepare("SELECT * FROM items WHERE meeting_id = ? ORDER BY position")
    .bind(id).all()).results;

  const actions = (await db
    .prepare(
      "SELECT a.* FROM actions a JOIN items i ON a.item_id = i.id " +
        "WHERE i.meeting_id = ? ORDER BY a.position"
    )
    .bind(id).all()).results;

  const byItem = {};
  for (const a of actions) {
    (byItem[a.item_id] = byItem[a.item_id] || []).push({
      id: a.id, text: a.text, owner: a.owner, done: !!a.done,
    });
  }

  return {
    id: meeting.id,
    title: meeting.title,
    date: meeting.date,
    start: meeting.start,
    target: meeting.target,
    updated_at: meeting.updated_at,
    updated_by: meeting.updated_by,
    items: items.map((it) => ({
      id: it.id,
      title: it.title,
      type: it.type,
      minutes: it.minutes,
      owner: it.owner,
      notes: it.notes,
      status: it.status,
      standing: !!it.standing,
      actions: byItem[it.id] || [],
    })),
  };
}

// Replace all items (and their actions) for a meeting, atomically.
export async function replaceItems(db, meetingId, items) {
  const existing = (await db
    .prepare("SELECT id FROM items WHERE meeting_id = ?")
    .bind(meetingId).all()).results;

  const stmts = [];
  for (const row of existing) {
    stmts.push(db.prepare("DELETE FROM actions WHERE item_id = ?").bind(row.id));
  }
  stmts.push(db.prepare("DELETE FROM items WHERE meeting_id = ?").bind(meetingId));

  (items || []).forEach((it, idx) => {
    const itemId = it.id || uid();
    stmts.push(
      db.prepare(
        "INSERT INTO items (id, meeting_id, position, title, type, minutes, owner, notes, status, standing) " +
          "VALUES (?,?,?,?,?,?,?,?,?,?)"
      ).bind(
        itemId,
        meetingId,
        idx,
        it.title || "",
        TYPES.includes(it.type) ? it.type : "discussion",
        parseInt(it.minutes, 10) || 0,
        it.owner || "",
        it.notes || "",
        STATUS.includes(it.status) ? it.status : "todo",
        it.standing ? 1 : 0
      )
    );
    (it.actions || []).forEach((a, ai) => {
      stmts.push(
        db.prepare(
          "INSERT INTO actions (id, item_id, position, text, owner, done) VALUES (?,?,?,?,?,?)"
        ).bind(a.id || uid(), itemId, ai, a.text || "", a.owner || "", a.done ? 1 : 0)
      );
    });
  });

  await db.batch(stmts);
}

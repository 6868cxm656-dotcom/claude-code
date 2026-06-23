// Shared helpers for the SLT Agenda API (Cloudflare Pages Functions + D1).
// Files prefixed with "_" are not routed, but can be imported by route files.

const TYPES = ["update", "decision", "discussion", "info"];
const STATUS = ["todo", "done", "carry"];
const KINDS = ["slt", "board", "subcommittee", "team"];
const DEFAULT_TARGET = 120;

// Standing items seeded onto new meetings.
export function standingSeed() {
  return [
    { title: "Welcome", type: "info", minutes: 5, standing: true },
    { title: "Review Team Meeting agenda next week", type: "discussion", minutes: 5, standing: true },
    { title: "Review SLT agenda next week", type: "discussion", minutes: 5, standing: true },
    { title: "AOB", type: "info", minutes: 5, standing: true },
  ];
}

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
    kind: meeting.kind,
    label: meeting.label,
    recording_url: meeting.recording_url,
    transcript: meeting.transcript,
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

// Insert a meeting (with optional seed items). Returns the new id.
export async function insertMeeting(db, m, email) {
  const id = m.id || uid();
  await db.prepare(
    "INSERT INTO meetings (id, title, date, start, target, kind, label, recording_url, transcript, updated_by) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).bind(
    id,
    m.title || "Senior Leadership Team",
    m.date || new Date().toISOString().slice(0, 10),
    m.start || "09:00",
    parseInt(m.target, 10) || DEFAULT_TARGET,
    KINDS.includes(m.kind) ? m.kind : "slt",
    m.label || "",
    m.recording_url || "",
    m.transcript || "",
    email
  ).run();
  if (Array.isArray(m.items) && m.items.length) {
    await replaceItems(db, id, m.items);
  }
  return id;
}

// Load all meetings (optionally within a date range) with lightweight items,
// for the planner board. Uses two queries rather than N+1.
export async function loadMeetingsWithItems(db, fromDate, toDate) {
  let q = "SELECT * FROM meetings";
  const binds = [];
  if (fromDate && toDate) {
    q += " WHERE date >= ? AND date <= ?";
    binds.push(fromDate, toDate);
  }
  q += " ORDER BY date ASC, created_at ASC";
  const meetings = (await db.prepare(q).bind(...binds).all()).results;

  const items = (await db
    .prepare("SELECT id, meeting_id, title, type, minutes, status, standing FROM items ORDER BY position")
    .all()).results;

  const byMeeting = {};
  for (const it of items) {
    (byMeeting[it.meeting_id] = byMeeting[it.meeting_id] || []).push({
      id: it.id, title: it.title, type: it.type, minutes: it.minutes,
      status: it.status, standing: !!it.standing,
    });
  }

  return meetings.map((m) => ({
    id: m.id, title: m.title, date: m.date, start: m.start, target: m.target,
    kind: m.kind, label: m.label, updated_by: m.updated_by,
    has_recording: !!(m.recording_url || m.transcript),
    items: byMeeting[m.id] || [],
  }));
}

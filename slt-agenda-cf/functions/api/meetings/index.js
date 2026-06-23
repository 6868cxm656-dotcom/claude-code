import { json, getEmail, uid, loadMeeting, replaceItems } from "../../_shared.js";

// GET /api/meetings — list all meetings (newest first) with a few summary fields.
export const onRequestGet = async ({ env }) => {
  const rows = (await env.DB.prepare(
    `SELECT m.id, m.title, m.date, m.start, m.target, m.updated_at, m.updated_by,
            COUNT(i.id) AS item_count
       FROM meetings m
       LEFT JOIN items i ON i.meeting_id = m.id
      GROUP BY m.id
      ORDER BY m.date DESC, m.created_at DESC`
  ).all()).results;
  return json(rows);
};

// POST /api/meetings — create a meeting (optionally with seed/carried items).
export const onRequestPost = async ({ request, env }) => {
  const body = await request.json().catch(() => ({}));
  const id = uid();
  const date = body.date || new Date().toISOString().slice(0, 10);
  const email = getEmail(request);

  await env.DB.prepare(
    "INSERT INTO meetings (id, title, date, start, target, updated_by) VALUES (?,?,?,?,?,?)"
  ).bind(
    id,
    body.title || "Senior Leadership Team",
    date,
    body.start || "09:00",
    parseInt(body.target, 10) || 60,
    email
  ).run();

  if (Array.isArray(body.items) && body.items.length) {
    await replaceItems(env.DB, id, body.items);
  }

  return json(await loadMeeting(env.DB, id), 201);
};

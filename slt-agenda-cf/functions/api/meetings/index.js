import { json, getEmail, insertMeeting, loadMeeting, loadMeetingsWithItems } from "../../_shared.js";

// GET /api/meetings        — summary list (newest first)
// GET /api/meetings?items=1 — meetings with lightweight items, for the planner
export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("items")) {
    return json(await loadMeetingsWithItems(env.DB));
  }
  const rows = (await env.DB.prepare(
    `SELECT m.id, m.title, m.date, m.start, m.target, m.kind, m.label, m.updated_at, m.updated_by,
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
  const id = await insertMeeting(env.DB, body, getEmail(request));
  return json(await loadMeeting(env.DB, id), 201);
};

import { json, getEmail, loadMeeting, replaceItems } from "../../_shared.js";

// GET /api/meetings/:id — full meeting with items and actions.
export const onRequestGet = async ({ params, env }) => {
  const meeting = await loadMeeting(env.DB, params.id);
  return meeting ? json(meeting) : json({ error: "Not found" }, 404);
};

// PUT /api/meetings/:id — save the whole meeting (header + items + actions).
export const onRequestPut = async ({ params, request, env }) => {
  const body = await request.json().catch(() => ({}));
  const email = getEmail(request);

  const exists = await env.DB.prepare("SELECT id FROM meetings WHERE id = ?")
    .bind(params.id).first();
  if (!exists) return json({ error: "Not found" }, 404);

  await env.DB.prepare(
    "UPDATE meetings SET title=?, date=?, start=?, target=?, kind=?, label=?, recording_url=?, transcript=?, " +
      "updated_at=datetime('now'), updated_by=? WHERE id=?"
  ).bind(
    body.title || "Senior Leadership Team",
    body.date,
    body.start || "09:00",
    parseInt(body.target, 10) || 120,
    ["slt", "board", "subcommittee", "team"].includes(body.kind) ? body.kind : "slt",
    body.label || "",
    body.recording_url || "",
    body.transcript || "",
    email,
    params.id
  ).run();

  await replaceItems(env.DB, params.id, Array.isArray(body.items) ? body.items : []);

  return json(await loadMeeting(env.DB, params.id));
};

// DELETE /api/meetings/:id — remove a meeting and everything under it.
export const onRequestDelete = async ({ params, env }) => {
  await replaceItems(env.DB, params.id, []); // clears items + actions
  await env.DB.prepare("DELETE FROM meetings WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
};

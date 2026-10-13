import { ensureSchema, getUser, json, logStatus, toRecord } from "../../_shared.js";

// PATCH /api/records/:id — merge changes into a record.
// Body: { data?: { ...fields to change }, parent?, position? }
// Only the fields sent are changed, so two people editing different fields of
// the same record don't overwrite each other.
export const onRequestPatch = async ({ params, request, env }) => {
  await ensureSchema(env.DB);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Body must be JSON" }, 400);

  const row = await env.DB.prepare("SELECT * FROM records WHERE id = ?").bind(params.id).first();
  if (!row) return json({ error: "Not found" }, 404);

  const rec = toRecord(row);
  const user = getUser(request);
  const patch = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : {};
  const data = { ...rec.data, ...patch };

  const statusChanged = rec.c === "objective" && ("status" in patch || "note" in patch);
  if (statusChanged) {
    data.status_at = new Date().toISOString();
    data.status_by = user;
  }

  const serialised = JSON.stringify(data);
  if (serialised.length > 1_000_000) return json({ error: "Record is too large" }, 400);

  const parent = "parent" in body ? body.parent || null : rec.parent;
  const position = Number.isFinite(body.position) ? body.position : rec.position;

  await env.DB.prepare(
    "UPDATE records SET data = ?, parent = ?, position = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ?"
  ).bind(serialised, parent, position, user, params.id).run();

  if (statusChanged) await logStatus(env.DB, params.id, data.status, data.note, user);

  const updated = await env.DB.prepare("SELECT * FROM records WHERE id = ?").bind(params.id).first();
  return json({ record: toRecord(updated) });
};

// DELETE /api/records/:id — remove a record and anything filed under it
// (a meeting's topics and notes, an objective's tasks and history).
export const onRequestDelete = async ({ params, env }) => {
  await ensureSchema(env.DB);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM records WHERE parent = ?").bind(params.id),
    env.DB.prepare("DELETE FROM records WHERE id = ?").bind(params.id),
    // Car park topics scheduled into a deleted meeting go back to the car park.
    env.DB.prepare(
      `UPDATE records SET data = json_set(data, '$.status', 'parked', '$.meeting_id', '')
       WHERE c = 'carpark' AND json_extract(data, '$.meeting_id') = ?`
    ).bind(params.id),
  ]);
  return json({ ok: true });
};

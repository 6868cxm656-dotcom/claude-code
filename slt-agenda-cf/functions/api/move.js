import { json, getEmail, loadMeeting, replaceItems } from "../_shared.js";

// POST /api/move — move an agenda item from one meeting to another.
// Body: { itemId, fromId, toId, toIndex? }
export const onRequestPost = async ({ request, env }) => {
  const body = await request.json().catch(() => ({}));
  const { itemId, fromId, toId } = body;
  if (!itemId || !fromId || !toId) return json({ error: "Missing fields" }, 400);

  const from = await loadMeeting(env.DB, fromId);
  const to = fromId === toId ? from : await loadMeeting(env.DB, toId);
  if (!from || !to) return json({ error: "Not found" }, 404);

  const idx = from.items.findIndex((i) => i.id === itemId);
  if (idx < 0) return json({ error: "Item not found" }, 404);

  const moved = from.items.splice(idx, 1)[0];
  const at = Number.isInteger(body.toIndex) && body.toIndex >= 0 ? body.toIndex : to.items.length;
  to.items.splice(at, 0, moved);

  const email = getEmail(request);
  await replaceItems(env.DB, fromId, from.items);
  if (toId !== fromId) await replaceItems(env.DB, toId, to.items);
  await env.DB.prepare(
    "UPDATE meetings SET updated_at=datetime('now'), updated_by=? WHERE id IN (?,?)"
  ).bind(email, fromId, toId).run();

  return json({ ok: true });
};

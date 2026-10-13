import { COLLECTIONS, checkRecord, ensureSchema, getUser, json, toRecord, uid } from "../../_shared.js";

// GET /api/records          — every record
// GET /api/records?c=a,b    — only these collections
export const onRequestGet = async ({ request, env }) => {
  await ensureSchema(env.DB);
  const url = new URL(request.url);
  const wanted = (url.searchParams.get("c") || "")
    .split(",").map((s) => s.trim()).filter((s) => COLLECTIONS.includes(s));

  let stmt;
  if (wanted.length) {
    stmt = env.DB.prepare(
      `SELECT * FROM records WHERE c IN (${wanted.map(() => "?").join(",")}) ORDER BY c, position, created_at`
    ).bind(...wanted);
  } else {
    stmt = env.DB.prepare("SELECT * FROM records ORDER BY c, position, created_at");
  }
  const rows = (await stmt.all()).results;
  return json({ records: rows.map(toRecord) });
};

// POST /api/records — create or replace records.
// Body: one record { c, id?, parent?, position?, data } or { records: [...] }.
// Records with an existing id are replaced, so importing twice doesn't duplicate.
export const onRequestPost = async ({ request, env }) => {
  await ensureSchema(env.DB);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Body must be JSON" }, 400);

  const list = Array.isArray(body.records) ? body.records : [body];
  if (list.length > 2000) return json({ error: "Too many records in one request" }, 400);
  for (const r of list) {
    const err = checkRecord(r);
    if (err) return json({ error: err }, 400);
  }

  const user = getUser(request);
  const ids = list.map((r) => r.id || uid());
  const stmts = list.map((r, i) =>
    env.DB.prepare(
      `INSERT INTO records (id, c, parent, position, data, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         c = excluded.c, parent = excluded.parent, position = excluded.position,
         data = excluded.data, updated_at = datetime('now'), updated_by = excluded.updated_by`
    ).bind(
      ids[i],
      r.c,
      r.parent || null,
      Number.isFinite(r.position) ? r.position : 0,
      JSON.stringify(r.data || {}),
      user
    )
  );

  // D1 batches run atomically; chunk to keep each batch a sensible size.
  for (let i = 0; i < stmts.length; i += 100) {
    await env.DB.batch(stmts.slice(i, i + 100));
  }
  return json({ ok: true, ids }, 201);
};

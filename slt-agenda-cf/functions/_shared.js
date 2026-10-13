// Shared helpers for the SLT scoreboard API (Cloudflare Pages Functions + D1).
// Files prefixed with "_" are not routed, but can be imported by route files.
//
// Everything lives in one "records" table. Each record has a collection name
// (c), an optional parent id (a meeting or objective), a sort position and a
// JSON data blob. The table creates itself on first use, so new features never
// need a manual database migration.

export const COLLECTIONS = [
  "kv",          // singletons: goal, playbook, team, health
  "objective",   // defining objectives and standard operating objectives
  "task",        // key tasks (parent: objective)
  "status_log",  // weekly status history (parent: objective)
  "meeting",     // tactical, strategic, offsite, board, subcommittee, team
  "lightning",   // lightning round entries (parent: meeting)
  "topic",       // agenda / strategic topics (parent: meeting)
  "action",      // actions (parent: meeting raised in)
  "decision",    // decisions (parent: meeting)
  "cascade",     // will say / won't say (parent: meeting)
  "carpark",     // strategic car park
  "notdo",       // potential not-do list
];

const MAX_DATA_BYTES = 1_000_000;

let schemaReady = null;
export function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS records (
           id         TEXT PRIMARY KEY,
           c          TEXT NOT NULL,
           parent     TEXT,
           position   REAL NOT NULL DEFAULT 0,
           data       TEXT NOT NULL DEFAULT '{}',
           created_at TEXT NOT NULL DEFAULT (datetime('now')),
           updated_at TEXT NOT NULL DEFAULT (datetime('now')),
           updated_by TEXT
         )`
      ),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_records_c ON records(c)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_records_parent ON records(parent)"),
    ]).catch((err) => {
      schemaReady = null; // retry on the next request
      throw err;
    });
  }
  return schemaReady;
}

// Who is making the change. Cloudflare Access supplies a verified email once it
// is switched on; until then the page sends the name the person picked.
export function getUser(request) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (email) return email;
  const name = (request.headers.get("X-SLT-User") || "").trim().slice(0, 40);
  return name;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function toRecord(row) {
  let data = {};
  try { data = JSON.parse(row.data || "{}"); } catch (e) { data = {}; }
  return {
    id: row.id,
    c: row.c,
    parent: row.parent,
    position: row.position,
    data,
    created_at: row.created_at,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}

// Validate an incoming record. Returns an error string, or null when valid.
export function checkRecord(r) {
  if (!r || typeof r !== "object") return "Record must be an object";
  if (!COLLECTIONS.includes(r.c)) return "Unknown collection: " + r.c;
  if (r.id !== undefined && (typeof r.id !== "string" || !r.id || r.id.length > 64)) return "Bad id";
  if (r.data !== undefined && (typeof r.data !== "object" || r.data === null || Array.isArray(r.data))) return "data must be an object";
  if (r.data && JSON.stringify(r.data).length > MAX_DATA_BYTES) return "Record is too large";
  return null;
}

// Monday (UTC) of the week containing `d`, as YYYY-MM-DD.
export function weekOf(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Mon=0
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}

// When an objective's status or note changes, record it against this week so
// the scoreboard can show a trend. One entry per objective per week.
export async function logStatus(db, objectiveId, status, note, user) {
  const week = weekOf();
  const existing = await db
    .prepare("SELECT id FROM records WHERE c = 'status_log' AND parent = ? AND json_extract(data, '$.week') = ?")
    .bind(objectiveId, week)
    .first();
  const data = JSON.stringify({ week, status: status || "", note: note || "", by: user || "" });
  if (existing) {
    await db
      .prepare("UPDATE records SET data = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ?")
      .bind(data, user, existing.id)
      .run();
  } else {
    await db
      .prepare("INSERT INTO records (id, c, parent, position, data, updated_by) VALUES (?, 'status_log', ?, 0, ?, ?)")
      .bind(uid(), objectiveId, data, user)
      .run();
  }
}

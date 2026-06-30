// TCF Risk Register — Cloudflare Worker API + static-asset server.
// Sits behind Cloudflare Access; reads the authenticated staff email it injects,
// derives the role server-side, and enforces the proposal/approval rules.
import {
  roleFor, isAdmin, canEditArea, COMMITTEES, EMAIL_TO_PERSON,
  decideSave, decideDelete, applyApprove, applyReject, applyFlag, applyClearFlag
} from "./logic.mjs";
import { SEED_RISKS, SEED_SETTINGS } from "./seed.mjs";

const json = (obj, status=200) =>
  new Response(JSON.stringify(obj), {status, headers:{"content-type":"application/json", "cache-control":"no-store"}});

// Create the schema and load the baseline once, on first use. Idempotent: the
// schema uses IF NOT EXISTS and seeding only runs when the risks table is empty.
async function ensureInit(env){
  await env.DB.exec("CREATE TABLE IF NOT EXISTS risks (id TEXT PRIMARY KEY, committee TEXT, l2 TEXT, updated TEXT, pending_new INTEGER DEFAULT 0, data TEXT NOT NULL)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS deleted (id TEXT PRIMARY KEY, deleted_at TEXT, data TEXT NOT NULL)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
  const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM risks").first();
  if(cnt && cnt.n > 0) return;
  const stmts = [];
  for(const r of SEED_RISKS){
    stmts.push(env.DB.prepare(
      "INSERT OR IGNORE INTO risks (id,committee,l2,updated,pending_new,data) VALUES (?,?,?,?,0,?)"
    ).bind(r.id, r.com, r.l2, r.updated||"", JSON.stringify(r)));
  }
  stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('global',?)").bind(JSON.stringify(SEED_SETTINGS)));
  await env.DB.batch(stmts);
}

// Idempotent one-off additions to an already-seeded database (guarded by a marker
// in settings). Currently: add the hidden "portal not ready on time" risk (R41).
async function ensureExtras(env){
  const m = await env.DB.prepare("SELECT v FROM settings WHERE k='extras_v1'").first();
  if(m) return;
  const extra = SEED_RISKS.find(r=>r.id==="R41");
  if(extra){
    await env.DB.prepare("INSERT OR IGNORE INTO risks (id,committee,l2,updated,pending_new,data) VALUES (?,?,?,?,0,?)")
      .bind(extra.id, extra.com, extra.l2, extra.updated||"", JSON.stringify(extra)).run();
  }
  await env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('extras_v1','1')").run();
}

// Cloudflare Access guarantees this header on every request to a protected hostname,
// overwriting any client-supplied value at the edge, so it is safe to trust here.
function emailFromRequest(req){
  return req.headers.get("Cf-Access-Authenticated-User-Email")
      || req.headers.get("X-Debug-Email")          // local/dev only; never set in production
      || "";
}

async function loadRisk(env, id){
  const row = await env.DB.prepare("SELECT data FROM risks WHERE id=?").bind(id).first();
  return row ? JSON.parse(row.data) : null;
}
async function upsertRisk(env, r){
  await env.DB.prepare(
    `INSERT INTO risks (id,committee,l2,updated,pending_new,data) VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET committee=excluded.committee,l2=excluded.l2,updated=excluded.updated,pending_new=excluded.pending_new,data=excluded.data`
  ).bind(r.id, r.com, r.l2, r.updated||"", r.pendingNew?1:0, JSON.stringify(r)).run();
}
async function removeRisk(env, id){ await env.DB.prepare("DELETE FROM risks WHERE id=?").bind(id).run(); }
async function tombstone(env, t){
  await env.DB.prepare("INSERT OR REPLACE INTO deleted (id,deleted_at,data) VALUES (?,?,?)")
    .bind(t.id, t.deletedAt||"", JSON.stringify(t)).run();
}
async function nextId(env){
  const rows = await env.DB.prepare("SELECT id FROM risks UNION SELECT id FROM deleted").all();
  let n = 0; (rows.results||[]).forEach(x=>{ const m=/^R(\d+)$/.exec(x.id); if(m) n=Math.max(n,+m[1]); });
  return "R" + String(n+1).padStart(2,"0");
}

async function handleApi(req, env){
  await ensureInit(env);
  await ensureExtras(env);
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/,"");
  const email = emailFromRequest(req);
  const role = roleFor(email);
  const now = new Date().toISOString();
  const body = req.method==="GET" ? {} : await req.json().catch(()=>({}));

  // identity + state. Hidden risks are returned ONLY to admins (Jim/Julia);
  // everyone else never receives them, so they cannot be seen even via the API.
  if(path==="/api/state" && req.method==="GET"){
    const rs = await env.DB.prepare("SELECT data FROM risks").all();
    const ds = await env.DB.prepare("SELECT data FROM deleted").all();
    const st = await env.DB.prepare("SELECT v FROM settings WHERE k='global'").first();
    let riskRows = (rs.results||[]).map(x=>JSON.parse(x.data));
    let delRows  = (ds.results||[]).map(x=>JSON.parse(x.data));
    if(!isAdmin(role)){ riskRows = riskRows.filter(r=>!r.hidden); delRows = delRows.filter(r=>!r.hidden); }
    return json({
      risks: riskRows,
      deleted: delRows,
      settings: st ? JSON.parse(st.v) : {},
      me: {email, role, admin: isAdmin(role)}
    });
  }

  if(role==="viewer") return json({error:"Read-only access"}, 403);

  // create / update a risk (admin → live, owner → proposal)
  if(path==="/api/risk" && req.method==="POST"){
    const proposed = body.risk || {};
    const id = proposed.id || await nextId(env);
    proposed.id = id;
    const prev = proposed.id ? await loadRisk(env, id) : null;
    if(prev && prev.hidden && !isAdmin(role)) return json({error:"Not found"}, 404);
    if(prev && body.baseUpdated && body.baseUpdated !== prev.updated)
      return json({error:"This risk changed since you opened it — please reload.", code:409}, 409);
    const res = decideSave(role, prev, proposed, body.note, now);
    if(res.error) return json({error:res.error}, res.noop?200:res.code);
    res.risk.id = id;
    await upsertRisk(env, res.risk);
    return json({ok:true, risk:res.risk, proposal:!!res.proposal});
  }

  // routes carrying an id: /api/risk/:id/... and /api/proposal/:id/...
  let m;
  // A hidden risk is invisible to non-admins on every per-id route too.
  const hiddenBlocked = async (id) => { const p = await loadRisk(env, id); return (p && p.hidden && !isAdmin(role)) ? null : p; };

  if((m = path.match(/^\/api\/risk\/([^/]+)\/visibility$/)) && req.method==="POST"){
    if(!isAdmin(role)) return json({error:"Admins only"}, 403);
    const prev = await loadRisk(env, m[1]); if(!prev) return json({error:"Not found"}, 404);
    prev.hidden = !!body.hidden; prev.updated = now;
    prev.history = (prev.history||[]).concat([{at:now, by:role,
      note: prev.hidden ? "Hidden from wider sharing" : "Made visible to all staff"}]);
    await upsertRisk(env, prev); return json({ok:true, risk:prev});
  }
  if((m = path.match(/^\/api\/risk\/([^/]+)\/flag$/)) && req.method==="POST"){
    const prev = await hiddenBlocked(m[1]); const r = applyFlag(role, prev, body.note, now);
    if(r.error) return json({error:r.error}, r.code); await upsertRisk(env, r.risk); return json({ok:true, risk:r.risk});
  }
  if((m = path.match(/^\/api\/risk\/([^/]+)\/clearflag$/)) && req.method==="POST"){
    const prev = await hiddenBlocked(m[1]); const r = applyClearFlag(role, prev, now);
    if(r.error) return json({error:r.error}, r.code); await upsertRisk(env, r.risk); return json({ok:true, risk:r.risk});
  }
  if((m = path.match(/^\/api\/risk\/([^/]+)$/)) && req.method==="DELETE"){
    const prev = await hiddenBlocked(m[1]); const d = decideDelete(role, prev, body.note, now);
    if(d.error) return json({error:d.error}, d.code);
    if(d.kind==="delete-live"){ await tombstone(env, {...prev, pending:null, deletedAt:now, deletedBy:role}); await removeRisk(env, prev.id); return json({ok:true, deleted:true}); }
    if(d.kind==="withdraw"){ await removeRisk(env, prev.id); return json({ok:true, withdrawn:true}); }
    await upsertRisk(env, d.risk); return json({ok:true, risk:d.risk, proposal:true});
  }
  if((m = path.match(/^\/api\/proposal\/([^/]+)\/approve$/)) && req.method==="POST"){
    const prev = await loadRisk(env, m[1]); const r = applyApprove(role, prev, now);
    if(r.error) return json({error:r.error}, r.code);
    if(r.remove){ await tombstone(env, r.tombstone); await removeRisk(env, prev.id); return json({ok:true, deleted:true}); }
    await upsertRisk(env, r.risk); return json({ok:true, risk:r.risk});
  }
  if((m = path.match(/^\/api\/proposal\/([^/]+)\/reject$/)) && req.method==="POST"){
    const prev = await loadRisk(env, m[1]); const r = applyReject(role, prev, body.reason, now);
    if(r.error) return json({error:r.error}, r.code);
    if(r.remove){ await removeRisk(env, prev.id); return json({ok:true, removed:true}); }
    await upsertRisk(env, r.risk); return json({ok:true, risk:r.risk});
  }

  if(path==="/api/settings" && req.method==="PUT"){
    if(!isAdmin(role)) return json({error:"Admins only"}, 403);
    const s = body.settings || {}; s.updated = now;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('global',?)").bind(JSON.stringify(s)).run();
    return json({ok:true, settings:s});
  }

  return json({error:"Not found"}, 404);
}

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    if(url.pathname.startsWith("/api/")){
      try{ return await handleApi(req, env); }
      catch(e){ return json({error:"Server error", detail:String(e)}, 500); }
    }
    return env.ASSETS.fetch(req);   // serve the front-end (public/index.html)
  }
};

// TCF Risk Register — Cloudflare Worker API + static-asset server.
// Sits behind Cloudflare Access; reads the authenticated staff email it injects,
// derives the role server-side, and enforces the proposal/approval rules.
import {
  roleFor, isAdmin, canEditArea, COMMITTEES, EMAIL_TO_PERSON, CAT_OWNER,
  decideSave, decideDelete, applyApprove, applyReject, applyFlag, applyClearFlag,
  decideMilestoneSave, applyAccessConfig, validateAccessConfig, peopleFromConfig,
  validatePanels, buildBudgetPanels
} from "./logic.mjs";
import { SEED_RISKS, SEED_SETTINGS, SEED_MILESTONES } from "./seed.mjs";

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
  // record when (re)seeding happens: if this is ever newer than the latest
  // snapshot, the front-end warns admins that the DB was re-initialised.
  await env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('seeded_at',?)")
    .bind(new Date().toISOString()).run();
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

// Milestones module storage: created and seeded independently of the risks table
// (which is already populated on the production database).
/* ============ SNAPSHOTS (backups) ============ */
async function ensureSnapshots(env){
  await env.DB.exec("CREATE TABLE IF NOT EXISTS snapshots (ts TEXT PRIMARY KEY, data TEXT NOT NULL)");
}
async function collectState(env){
  const out = {};
  for(const [key, sql] of [["risks","SELECT data FROM risks"],["deleted","SELECT data FROM deleted"],["milestones","SELECT data FROM milestones"]]){
    const rows = await env.DB.prepare(sql).all();
    out[key] = (rows.results||[]).map(x=>JSON.parse(x.data));
  }
  const g = await env.DB.prepare("SELECT v FROM settings WHERE k='global'").first();
  const a = await env.DB.prepare("SELECT v FROM settings WHERE k='access'").first();
  const b = await env.DB.prepare("SELECT v FROM settings WHERE k='budget'").first();
  out.settings = g ? JSON.parse(g.v) : {};
  out.access = a ? JSON.parse(a.v) : null;
  out.budget = b ? JSON.parse(b.v) : null;
  return out;
}
async function takeSnapshot(env, now){
  await ensureSnapshots(env);
  const state = await collectState(env);
  await env.DB.prepare("INSERT OR REPLACE INTO snapshots (ts,data) VALUES (?,?)")
    .bind(now, JSON.stringify(state)).run();
  await env.DB.prepare("DELETE FROM snapshots WHERE ts NOT IN (SELECT ts FROM snapshots ORDER BY ts DESC LIMIT 30)").run();
  return {ts: now, risks: state.risks.length, milestones: state.milestones.length};
}
async function restoreSnapshot(env, ts){
  const row = await env.DB.prepare("SELECT data FROM snapshots WHERE ts=?").bind(ts).first();
  if(!row) return null;
  const s = JSON.parse(row.data);
  for(const t of ["risks","deleted","milestones"]) await env.DB.prepare("DELETE FROM "+t).run();
  const stmts = [];
  for(const r of (s.risks||[])) stmts.push(env.DB.prepare("INSERT OR REPLACE INTO risks (id,committee,l2,updated,pending_new,data) VALUES (?,?,?,?,?,?)").bind(r.id, r.com, r.l2, r.updated||"", r.pendingNew?1:0, JSON.stringify(r)));
  for(const d of (s.deleted||[])) stmts.push(env.DB.prepare("INSERT OR REPLACE INTO deleted (id,deleted_at,data) VALUES (?,?,?)").bind(d.id, d.deletedAt||"", JSON.stringify(d)));
  for(const m of (s.milestones||[])) stmts.push(env.DB.prepare("INSERT OR REPLACE INTO milestones (id,owner,soap,updated,data) VALUES (?,?,?,?,?)").bind(m.id, m.owner, m.soap, m.updated||"", JSON.stringify(m)));
  stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('global',?)").bind(JSON.stringify(s.settings||{})));
  if(s.budget!=null) stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('budget',?)").bind(JSON.stringify(s.budget)));
  else stmts.push(env.DB.prepare("DELETE FROM settings WHERE k='budget'"));
  // NB: the access config is deliberately NOT restored — restoring an old
  // permission model (or old JWT enforcement values) could lock admins out.
  // Panel visibility ('panels') is not restored either: restoring must never
  // silently resurface a panel an admin has since hidden.
  if(stmts.length) await env.DB.batch(stmts);
  return {ts, risks:(s.risks||[]).length, milestones:(s.milestones||[]).length};
}

async function ensureMilestones(env){
  await env.DB.exec("CREATE TABLE IF NOT EXISTS milestones (id TEXT PRIMARY KEY, owner TEXT, soap TEXT, updated TEXT, data TEXT NOT NULL)");
  const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM milestones").first();
  if(cnt && cnt.n > 0) return;
  const stmts = SEED_MILESTONES.map(m => env.DB.prepare(
    "INSERT OR IGNORE INTO milestones (id,owner,soap,updated,data) VALUES (?,?,?,?,?)"
  ).bind(m.id, m.owner, m.soap, m.updated||"", JSON.stringify(m)));
  if(stmts.length) await env.DB.batch(stmts);
}
async function loadMilestone(env, id){
  const row = await env.DB.prepare("SELECT data FROM milestones WHERE id=?").bind(id).first();
  return row ? JSON.parse(row.data) : null;
}
async function upsertMilestone(env, m){
  await env.DB.prepare(
    `INSERT INTO milestones (id,owner,soap,updated,data) VALUES (?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,soap=excluded.soap,updated=excluded.updated,data=excluded.data`
  ).bind(m.id, m.owner, m.soap, m.updated||"", JSON.stringify(m)).run();
}
async function nextMilestoneId(env){
  const rows = await env.DB.prepare("SELECT id FROM milestones").all();
  let n = 0; (rows.results||[]).forEach(x=>{ const mm=/^M(\d+)$/.exec(x.id); if(mm) n=Math.max(n,+mm[1]); });
  return "M" + String(n+1).padStart(2,"0");
}

/* ============ SIGN-IN VERIFICATION (JWT hardening) ============
   When the access config carries teamDomain + aud, every API request must
   present a valid Cf-Access-Jwt-Assertion signed by Cloudflare — the email is
   then taken from the verified token, not the header. Unconfigured, we fall
   back to the header (safe only while the URL stays behind the Access policy). */
let jwksCache = {domain:null, keys:null, at:0};
function b64uToBytes(s){
  s = String(s).replace(/-/g,"+").replace(/_/g,"/");
  const pad = s.length%4 ? "=".repeat(4-(s.length%4)) : "";
  const bin = atob(s+pad);
  const u = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
  return u;
}
function b64uJson(s){ return JSON.parse(new TextDecoder().decode(b64uToBytes(s))); }
async function verifyAccessJWT(token, teamDomain, aud){
  try{
    const parts = String(token||"").split(".");
    if(parts.length!==3) return {error:"no or malformed token"};
    const header = b64uJson(parts[0]), payload = b64uJson(parts[1]);
    const iss = "https://"+teamDomain+".cloudflareaccess.com";
    if(payload.iss !== iss) return {error:"wrong issuer"};
    const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud===aud;
    if(!audOk) return {error:"wrong audience"};
    if(!payload.exp || payload.exp*1000 < Date.now()) return {error:"token expired"};
    if(jwksCache.domain!==teamDomain || !jwksCache.keys || Date.now()-jwksCache.at > 3600*1000){
      const res = await fetch(iss+"/cdn-cgi/access/certs");
      if(!res.ok) return {error:"key service unavailable"};
      jwksCache = {domain:teamDomain, keys:(await res.json()).keys||[], at:Date.now()};
    }
    let jwk = jwksCache.keys.find(k=>k.kid===header.kid);
    if(!jwk){ jwksCache.at = 0; return {error:"unknown signing key"}; }
    const key = await crypto.subtle.importKey("jwk", jwk, {name:"RSASSA-PKCS1-v1_5", hash:"SHA-256"}, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64uToBytes(parts[2]),
      new TextEncoder().encode(parts[0]+"."+parts[1]));
    return ok ? {email: String(payload.email||"").toLowerCase()} : {error:"bad signature"};
  }catch(e){ return {error:"verification failed"}; }
}

// Cloudflare Access guarantees this header on every request to a protected hostname,
// overwriting any client-supplied value at the edge. Used when JWT enforcement
// is not yet configured.
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
// Plain INSERT (no upsert) for new risks, so a concurrent create with the same id
// fails with a constraint error instead of silently overwriting the other risk.
async function insertRisk(env, r){
  await env.DB.prepare("INSERT INTO risks (id,committee,l2,updated,pending_new,data) VALUES (?,?,?,?,?,?)")
    .bind(r.id, r.com, r.l2, r.updated||"", r.pendingNew?1:0, JSON.stringify(r)).run();
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

async function loadAccess(env){
  const row = await env.DB.prepare("SELECT v FROM settings WHERE k='access'").first();
  return row ? JSON.parse(row.v) : null;
}
async function loadBudget(env){
  const row = await env.DB.prepare("SELECT v FROM settings WHERE k='budget'").first();
  return row ? JSON.parse(row.v) : null;
}
async function loadPanels(env){
  const row = await env.DB.prepare("SELECT v FROM settings WHERE k='panels'").first();
  return row ? JSON.parse(row.v) : {hidden:[]};
}

async function handleApi(req, env){
  await ensureInit(env);
  await ensureExtras(env);
  await ensureMilestones(env);
  await ensureSnapshots(env);
  // Apply the stored access config (or defaults) so every rule below uses it.
  const accessCfg = await loadAccess(env);
  applyAccessConfig(accessCfg);
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/,"");
  const jwtEnforced = !!(accessCfg && accessCfg.teamDomain && accessCfg.aud);
  let email;
  if(jwtEnforced){
    const v = await verifyAccessJWT(req.headers.get("Cf-Access-Jwt-Assertion"), accessCfg.teamDomain, accessCfg.aud);
    if(v.error) return json({error:"Your sign-in could not be verified ("+v.error+") — reload the page to sign in again."}, 401);
    email = v.email;
  } else {
    email = emailFromRequest(req);
  }
  const realRole = roleFor(email);
  // "View as": admins may preview another user's read view. Honoured ONLY on
  // the read-only GETs (/api/state, /api/budget) — every write route keeps
  // the real identity.
  let role = realRole, viewAs = null;
  if((path==="/api/state" || path==="/api/budget") && req.method==="GET" && isAdmin(realRole)){
    const va = url.searchParams.get("viewAs");
    if(va){
      const people = peopleFromConfig(accessCfg);
      const hit = people.find(p=>p.name===va && p.group!=="viewer");
      role = hit ? hit.name : "viewer";
      viewAs = va;
    }
  }
  const now = new Date().toISOString();
  const body = req.method==="GET" ? {} : await req.json().catch(()=>({}));

  // identity + state. Hidden risks are returned ONLY to admins (Jim/Julia);
  // everyone else never receives them, so they cannot be seen even via the API.
  if(path==="/api/state" && req.method==="GET"){
    const rs = await env.DB.prepare("SELECT data FROM risks").all();
    const ds = await env.DB.prepare("SELECT data FROM deleted").all();
    const st = await env.DB.prepare("SELECT v FROM settings WHERE k='global'").first();
    const ms = await env.DB.prepare("SELECT data FROM milestones").all();
    let riskRows = (rs.results||[]).map(x=>JSON.parse(x.data));
    let delRows  = (ds.results||[]).map(x=>JSON.parse(x.data));
    if(!isAdmin(role)){ riskRows = riskRows.filter(r=>!r.hidden); delRows = delRows.filter(r=>!r.hidden); }
    const budgetCfg = await loadBudget(env);
    const panelsCfg = await loadPanels(env);
    const visiblePanels = budgetCfg ? Object.keys(budgetCfg.panels||{})
      .filter(p => isAdmin(role) || !(panelsCfg.hidden||[]).includes(p)).length : 0;
    return json({
      risks: riskRows,
      deleted: delRows,
      milestones: (ms.results||[]).map(x=>JSON.parse(x.data)),
      settings: st ? JSON.parse(st.v) : {},
      people: peopleFromConfig(accessCfg),                 // staff directory for dropdowns/emails
      catOwner: {...CAT_OWNER},                            // effective area ownership
      access: isAdmin(realRole) ? (accessCfg || null) : undefined,
      budget: {present: !!budgetCfg, visible: visiblePanels},   // payload itself comes from GET /api/budget
      panels: isAdmin(realRole) ? panelsCfg : undefined,
      security: {jwtEnforced},
      seededAt: (await env.DB.prepare("SELECT v FROM settings WHERE k='seeded_at'").first() || {}).v || null,
      lastSnapshot: (await env.DB.prepare("SELECT MAX(ts) AS t FROM snapshots").first() || {}).t || null,
      me: {email, role, admin: isAdmin(role), realRole, realAdmin: isAdmin(realRole), viewAs}
    });
  }

  // Budget module payload, fetched when the module opens (kept out of /api/state
  // to keep the 45s poll light). Hidden panels are stripped server-side for
  // non-admins — like hidden risks, their data never leaves the server.
  if(path==="/api/budget" && req.method==="GET"){
    const budgetCfg = await loadBudget(env);
    const panelsCfg = await loadPanels(env);
    if(!budgetCfg) return json({present:false, panels:{}, meta:null,
      hidden: isAdmin(role) ? (panelsCfg.hidden||[]) : undefined});
    const out = {};
    for(const [p, payload] of Object.entries(budgetCfg.panels||{}))
      if(isAdmin(role) || !(panelsCfg.hidden||[]).includes(p)) out[p] = payload;
    return json({present:true, panels:out, meta:budgetCfg.meta||null,
      hidden: isAdmin(role) ? (panelsCfg.hidden||[]) : undefined});
  }
  // Import (replace) the budget dataset — admins only. The raw payload is
  // transformed into five independent per-panel payloads at import time.
  if(path==="/api/budget" && req.method==="POST"){
    if(!isAdmin(realRole)) return json({error:"Admins only"}, 403);
    const raw = body.budget || {};
    let panels;
    try{ panels = buildBudgetPanels(raw); }
    catch(e){ return json({error:"Import failed: "+((e&&e.message)||e)+". Expected the built dashboard HTML or its JSON payloads."}, 400); }
    const meta = {imported:now, importedBy:realRole, label:String(raw.label||"").slice(0,120),
      lines:(raw.data||[]).length, varianceLines:(raw.variance||[]).length};
    await env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('budget',?)")
      .bind(JSON.stringify({meta, panels})).run();
    return json({ok:true, meta});
  }
  if(path==="/api/budget" && req.method==="DELETE"){
    if(!isAdmin(realRole)) return json({error:"Admins only"}, 403);
    await env.DB.prepare("DELETE FROM settings WHERE k='budget'").run();
    return json({ok:true, deleted:true});
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
    if(prev){
      res.risk.id = id;
      await upsertRisk(env, res.risk);
    }else{
      // retry with the next id on collision (two people creating at the same moment)
      let newId = id, done = false;
      for(let i=0; i<4 && !done; i++){
        try{ res.risk.id = newId; await insertRisk(env, res.risk); done = true; }
        catch(e){
          if(/UNIQUE|constraint/i.test(String(e))) newId = "R" + String(parseInt(newId.slice(1),10)+1).padStart(2,"0");
          else throw e;
        }
      }
      if(!done) return json({error:"Could not allocate a risk id — please try again."}, 503);
    }
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

  // milestones: owner updates live (no QA gate); admins edit anything; delete admin-only
  if(path==="/api/milestone" && req.method==="POST"){
    const proposed = body.milestone || {};
    const prev = proposed.id ? await loadMilestone(env, proposed.id) : null;
    if(proposed.id && !prev) return json({error:"Not found"}, 404);
    if(prev && body.baseUpdated && body.baseUpdated !== prev.updated)
      return json({error:"This milestone changed since you opened it — please reload.", code:409}, 409);
    const res = decideMilestoneSave(role, prev, proposed, body.note, now);
    if(res.error) return json({error:res.error}, res.noop?200:res.code);
    if(!prev) res.milestone.id = await nextMilestoneId(env);
    await upsertMilestone(env, res.milestone);
    return json({ok:true, milestone:res.milestone});
  }
  if((m = path.match(/^\/api\/milestone\/([^/]+)$/)) && req.method==="DELETE"){
    if(!isAdmin(role)) return json({error:"Admins only"}, 403);
    const prev = await loadMilestone(env, m[1]); if(!prev) return json({error:"Not found"}, 404);
    await env.DB.prepare("DELETE FROM milestones WHERE id=?").bind(m[1]).run();
    return json({ok:true, deleted:true});
  }

  // snapshots — admins only
  if(path==="/api/snapshots" && req.method==="GET"){
    if(!isAdmin(realRole)) return json({error:"Admins only"}, 403);
    const rows = await env.DB.prepare("SELECT ts, LENGTH(data) AS bytes FROM snapshots ORDER BY ts DESC").all();
    return json({ok:true, snapshots:(rows.results||[])});
  }
  if(path==="/api/snapshot" && req.method==="POST"){
    if(!isAdmin(realRole)) return json({error:"Admins only"}, 403);
    return json({ok:true, snapshot: await takeSnapshot(env, now)});
  }
  if((m = path.match(/^\/api\/snapshot\/([^/]+)$/)) && req.method==="GET"){
    if(!isAdmin(realRole)) return json({error:"Admins only"}, 403);
    const row = await env.DB.prepare("SELECT data FROM snapshots WHERE ts=?").bind(decodeURIComponent(m[1])).first();
    if(!row) return json({error:"Not found"}, 404);
    return new Response(row.data, {headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  if((m = path.match(/^\/api\/snapshot\/([^/]+)\/restore$/)) && req.method==="POST"){
    if(!isAdmin(realRole)) return json({error:"Admins only"}, 403);
    await takeSnapshot(env, now);   // safety snapshot of the current state first
    const res = await restoreSnapshot(env, decodeURIComponent(m[1]));
    if(!res) return json({error:"Snapshot not found"}, 404);
    return json({ok:true, restored:res});
  }

  if(path==="/api/settings" && req.method==="PUT"){
    if(!isAdmin(role)) return json({error:"Admins only"}, 403);
    const s = body.settings || {}; s.updated = now;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('global',?)").bind(JSON.stringify(s)).run();
    return json({ok:true, settings:s});
  }

  // panel visibility — admins only. Hidden panels are stripped server-side
  // for everyone except admins (Jim/Julia see everything, with a badge).
  if(path==="/api/panels" && req.method==="PUT"){
    if(!isAdmin(realRole)) return json({error:"Admins only"}, 403);
    const cfg = {hidden: (body.panels && body.panels.hidden) || []};
    const err = validatePanels(cfg);
    if(err) return json({error:err}, 400);
    cfg.updated = now; cfg.updatedBy = realRole;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('panels',?)")
      .bind(JSON.stringify(cfg)).run();
    return json({ok:true, panels:cfg});
  }

  // access config — admins only, with lockout guards
  if(path==="/api/access" && req.method==="PUT"){
    if(!isAdmin(realRole)) return json({error:"Admins only"}, 403);
    const cfg = body.access || {};
    const err = validateAccessConfig(cfg, realRole);
    if(err) return json({error:err}, 400);
    // Lockout guard for JWT enforcement: before enabling (or changing) it, the
    // CURRENT request's token must verify against the NEW values — otherwise
    // the admin saving this would lock everyone out, including themselves.
    if(cfg.teamDomain && cfg.aud){
      cfg.teamDomain = String(cfg.teamDomain).trim().replace(/^https?:\/\//,"").replace(/\.cloudflareaccess\.com.*$/,"");
      cfg.aud = String(cfg.aud).trim();
      const v = await verifyAccessJWT(req.headers.get("Cf-Access-Jwt-Assertion"), cfg.teamDomain, cfg.aud);
      if(v.error) return json({error:"Refusing to enable sign-in verification: your own current sign-in does not verify against those values ("+v.error+"). Double-check the team domain and the Application Audience (AUD) tag."}, 400);
    } else { delete cfg.teamDomain; delete cfg.aud; }
    cfg.updated = now; cfg.updatedBy = realRole;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES ('access',?)").bind(JSON.stringify(cfg)).run();
    return json({ok:true, access:cfg});
  }

  return json({error:"Not found"}, 404);
}

export default {
  // Daily backup (03:00 UTC cron in wrangler.jsonc): snapshot the whole state.
  async scheduled(event, env, ctx){
    await ensureInit(env); await ensureExtras(env); await ensureMilestones(env);
    await takeSnapshot(env, new Date().toISOString());
  },
  async fetch(req, env){
    const url = new URL(req.url);
    if(url.pathname.startsWith("/api/")){
      try{ return await handleApi(req, env); }
      catch(e){ return json({error:"Server error", detail:String(e)}, 500); }
    }
    return env.ASSETS.fetch(req);   // serve the front-end (public/index.html)
  }
};

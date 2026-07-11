// Pure, testable business logic shared by the Worker (and exercised by node tests).
// No I/O here — just permission rules and the proposal/approval state machine.

export const CAT_OWNER = { "1":"Julia", "2":"Nikesh", "3":"Jacqui", "4":"Chris", "5":"Jim", "6":"Julia", "7":"Jim", "8":"Jim" };
export const ADMINS = ["Jim", "Julia"];
export const COMMITTEES = ["Board", "PFC", "ARGC", "IC", "RNC"];
export const EMAIL_TO_PERSON = {
  "jim.riddiford@churchillfellowship.org": "Jim",
  "julia.weston@churchillfellowship.org": "Julia",
  "nikesh.patel@churchillfellowship.org": "Nikesh",
  "jacqui.morrissey@churchillfellowship.org": "Jacqui",
  "chris.mann@churchillfellowship.org": "Chris"
};
export const FIELDS = ["title","desc","l2","com","l","i","controls","actions","status","review","draft"];

export function roleFor(email){
  if(!email) return "viewer";
  return EMAIL_TO_PERSON[String(email).toLowerCase()] || "viewer";
}
export function isAdmin(role){ return ADMINS.includes(role); }
export function catOf(l2){ return String(l2||"").split(".")[0]; }
export function ownerOf(l2){ return CAT_OWNER[catOf(l2)] || null; }
export function canEditArea(role, l2){
  if(role==="viewer") return false;
  if(isAdmin(role)) return true;
  return ownerOf(l2) === role;
}
export function sameVal(a,b){ return JSON.stringify(a===undefined?null:a) === JSON.stringify(b===undefined?null:b); }
export function diffRisk(prev, next){
  const changes = [];
  FIELDS.forEach(f=>{ if(!sameVal(prev[f], next[f])) changes.push({f, from:prev[f], to:next[f]}); });
  return changes;
}
export function pickFields(o){ const f={}; FIELDS.forEach(k=>f[k]=o[k]); return f; }

// Decide the authoritative result of a save.
// prev = current DB risk (or null for new); proposed = incoming risk fields; returns {risk} or {error,code}.
export function decideSave(role, prev, proposed, note, now){
  if(!proposed || !proposed.title || !String(proposed.title).trim()) return {error:"Title required", code:400};
  if(!canEditArea(role, proposed.l2)) return {error:"You can only change risks in your own area", code:403};
  const admin = isAdmin(role);
  const fields = pickFields(proposed);

  if(prev){
    if(!canEditArea(role, prev.l2)) return {error:"You do not own this risk", code:403};
    const changes = diffRisk(prev, {...prev, ...fields});
    if(admin){
      if(!changes.length && !prev.pending) return {error:"No changes", code:200, noop:true};
      const risk = {...prev, ...fields, flag:prev.flag||null, pending:null, pendingNew:false, updated:now,
        created: prev.created||now,
        history:(prev.history||[]).concat(changes.length?[{at:now, by:role, changes}]:[])};
      return {risk};
    }else{
      if(!changes.length) return {error:"No changes to propose", code:200, noop:true};
      const risk = {...prev, pending:{kind:"edit", by:role, at:now, note:note||"", fields}};
      return {risk, proposal:true};
    }
  }else{
    const base = {...fields, id:proposed.id, status:proposed.status||"Open", flag:null, created:now, updated:now,
      history:[{at:now, by:role, created:true}]};
    if(admin){ base.pending=null; base.pendingNew=false; return {risk:base}; }
    base.pendingNew=true; base.pending={kind:"new", by:role, at:now, note:note||""};
    return {risk:base, proposal:true};
  }
}

export function decideDelete(role, prev, note, now){
  if(!prev) return {error:"Not found", code:404};
  if(!canEditArea(role, prev.l2)) return {error:"You do not own this risk", code:403};
  if(isAdmin(role)) return {kind:"delete-live"};
  if(prev.pending && prev.pending.kind==="new" && prev.pending.by===role) return {kind:"withdraw"};
  return {kind:"propose-delete", risk:{...prev, pending:{kind:"delete", by:role, at:now, note:note||""}}};
}

export function applyApprove(role, prev, now){
  if(!isAdmin(role)) return {error:"Admins only", code:403};
  if(!prev || !prev.pending) return {error:"No pending proposal", code:404};
  const p = prev.pending;
  if(p.kind==="delete"){
    const tomb = {...prev, pending:null, deletedAt:now, deletedBy:role,
      history:(prev.history||[]).concat([{at:now, by:role, note:`Deletion proposed by ${p.by} approved`}])};
    return {tombstone:tomb, remove:true};
  }
  if(p.kind==="new"){
    return {risk:{...prev, pendingNew:false, pending:null, updated:now,
      history:(prev.history||[]).concat([{at:now, by:role, note:`New risk proposed by ${p.by} approved — now live`}])}};
  }
  // edit
  const proposed = {...prev, ...p.fields};
  const changes = diffRisk(prev, proposed);
  return {risk:{...prev, ...p.fields, pending:null, updated:now,
    history:(prev.history||[]).concat([{at:now, by:p.by, changes, approvedBy:role}])}};
}

export function applyReject(role, prev, reason, now){
  if(!isAdmin(role)) return {error:"Admins only", code:403};
  if(!prev || !prev.pending) return {error:"No pending proposal", code:404};
  const p = prev.pending;
  if(p.kind==="new") return {remove:true};
  return {risk:{...prev, pending:null,
    history:(prev.history||[]).concat([{at:now, by:role, note:`${p.kind} proposed by ${p.by} rejected: ${reason||"(no reason given)"}`}])}};
}

export function applyFlag(role, prev, note, now){
  if(role==="viewer") return {error:"Read-only", code:403};
  if(!prev) return {error:"Not found", code:404};
  const flag = {by:role, at:now, note:note||""};
  return {risk:{...prev, flag, updated:prev.updated,
    history:(prev.history||[]).concat([{at:now, by:role, changes:[{f:"flag", from:prev.flag||null, to:flag}]}])}};
}
export function applyClearFlag(role, prev, now){
  if(!prev || !prev.flag) return {error:"No flag", code:404};
  if(!(isAdmin(role) || canEditArea(role, prev.l2) || prev.flag.by===role)) return {error:"Not permitted", code:403};
  return {risk:{...prev, flag:null,
    history:(prev.history||[]).concat([{at:now, by:role, changes:[{f:"flag", from:prev.flag, to:null}]}])}};
}

/* ============ MILESTONES ============ */
export const MILESTONE_FIELDS = ["title","desc","owner","soap","year","due","rag","progress","com","draft"];
export const RAGS = ["On track","At risk","Off track","Done"];
export function canEditMilestone(role, m){
  if(role==="viewer") return false;
  return isAdmin(role) || m.owner===role;
}
export function diffMilestone(prev, next){
  const changes = [];
  MILESTONE_FIELDS.forEach(f=>{ if(!sameVal(prev[f], next[f])) changes.push({f, from:prev[f], to:next[f]}); });
  return changes;
}
// Milestone updates are live for their owner (no QA gate — decision 8.3 in the plan).
export function decideMilestoneSave(role, prev, proposed, note, now){
  if(!proposed || !String(proposed.title||"").trim()) return {error:"Title required", code:400};
  if(!RAGS.includes(proposed.rag||"On track")) return {error:"Invalid status", code:400};
  if(prev){
    if(!canEditMilestone(role, prev)) return {error:"You can only update your own milestones", code:403};
    if(!isAdmin(role) && proposed.owner && proposed.owner!==prev.owner)
      return {error:"Only Jim/Julia can reassign a milestone", code:403};
    const fields = {}; MILESTONE_FIELDS.forEach(f=>{ if(proposed[f]!==undefined) fields[f]=proposed[f]; });
    const merged = {...prev, ...fields};
    const changes = diffMilestone(prev, merged);
    if(!changes.length && !note) return {error:"No changes", code:200, noop:true};
    const entry = {at:now, by:role};
    if(changes.length) entry.changes = changes;
    if(note) entry.note = note;
    return {milestone:{...merged, updated:now, history:(prev.history||[]).concat([entry])}};
  }
  if(role==="viewer") return {error:"Read-only access", code:403};
  const owner = isAdmin(role) ? (proposed.owner||role) : role;   // owners create for themselves
  const base = {...proposed, owner, created:now, updated:now,
    history:[{at:now, by:role, created:true}].concat(note?[{at:now, by:role, note}]:[])};
  return {milestone:base};
}

/* ============ ACCESS CONFIG (editable via the Access module) ============ */
// Defaults captured once; applyAccessConfig resets to them before applying an
// override, so deleting the stored config cleanly restores the original model.
const DEFAULT_EMAILS = {...EMAIL_TO_PERSON};
const DEFAULT_ADMINS = [...ADMINS];
const DEFAULT_CAT = {...CAT_OWNER};
export function defaultAccessConfig(){
  return {
    users: Object.entries(DEFAULT_EMAILS).map(([email,name])=>({email, name, group: DEFAULT_ADMINS.includes(name) ? "admin" : "editor"})),
    catOwner: {...DEFAULT_CAT},
    updated: null
  };
}
export function applyAccessConfig(cfg){
  Object.keys(EMAIL_TO_PERSON).forEach(k=>delete EMAIL_TO_PERSON[k]);
  Object.assign(EMAIL_TO_PERSON, DEFAULT_EMAILS);
  ADMINS.length = 0; DEFAULT_ADMINS.forEach(a=>ADMINS.push(a));
  Object.assign(CAT_OWNER, DEFAULT_CAT);
  if(!cfg || !Array.isArray(cfg.users) || !cfg.users.length) return;
  Object.keys(EMAIL_TO_PERSON).forEach(k=>delete EMAIL_TO_PERSON[k]);
  ADMINS.length = 0;
  for(const u of cfg.users){
    if(!u || !u.email || !u.name) continue;
    if(u.group!=="viewer") EMAIL_TO_PERSON[String(u.email).toLowerCase()] = u.name;  // viewers resolve to role "viewer"
    if(u.group==="admin" && !ADMINS.includes(u.name)) ADMINS.push(u.name);
  }
  if(cfg.catOwner) Object.entries(cfg.catOwner).forEach(([c,o])=>{ if(CAT_OWNER[c]!==undefined && o) CAT_OWNER[c] = o; });
}
export function validateAccessConfig(cfg, requesterName){
  if(!cfg || !Array.isArray(cfg.users) || !cfg.users.length) return "At least one user is required";
  for(const u of cfg.users){
    if(!u.email || !String(u.email).includes("@")) return "Every user needs a valid email";
    if(!u.name || !String(u.name).trim()) return "Every user needs a name";
    if(!["admin","editor","viewer"].includes(u.group)) return "Group must be admin, editor or viewer";
  }
  const emails = cfg.users.map(u=>String(u.email).toLowerCase());
  if(new Set(emails).size !== emails.length) return "Duplicate email in user list";
  const admins = cfg.users.filter(u=>u.group==="admin").map(u=>u.name);
  if(!admins.length) return "At least one admin is required — you would be locked out";
  if(requesterName && !admins.includes(requesterName)) return "You cannot remove your own admin access";
  const editable = new Set(cfg.users.filter(u=>u.group!=="viewer").map(u=>u.name));
  for(const [c,o] of Object.entries(cfg.catOwner||{}))
    if(o && !editable.has(o)) return `Area owner "${o}" is not an admin or editor in the user list`;
  if(cfg.teamDomain && !cfg.aud) return "Sign-in verification needs both a team domain and an AUD tag";
  if(cfg.aud && !cfg.teamDomain) return "Sign-in verification needs both a team domain and an AUD tag";
  return null;
}
export function peopleFromConfig(cfg){
  const c = (cfg && Array.isArray(cfg.users) && cfg.users.length) ? cfg : defaultAccessConfig();
  return c.users.map(u=>({name:u.name, group:u.group, email:u.email}));
}

/* ============ BUDGET MODULE + PANEL VISIBILITY ============
   The budget dashboard's five panels are precomputed at import time into
   independent payloads, so hiding a panel means its data NEVER leaves the
   server for non-admins (same covenant as hidden risks). Raw import shape
   (from budget-dashboard/build.py or the built dashboard HTML):
     data:     [{dept, cls, act, typ, code, name, b2526, rf2526, a2526,
                 b2627, cont, desc, phase[12]}]
     variance: [{section, group, code, name, fy_budget, fy_rf, ytd_rf,
                 ytd_act, var, var_pct}]   (optional)
     map:      {structure:{line:{activity, codes[]}}, code_to_line:{}} (optional) */
export const KNOWN_PANELS = ["budget.org","budget.variance","budget.holder","budget.structure","budget.health"];
export const PANEL_LABELS = {
  "budget.org":"Organisation overview", "budget.variance":"Monthly variance",
  "budget.holder":"Budget holder view", "budget.structure":"Proposed structure",
  "budget.health":"Data health"
};
export function validatePanels(cfg){
  if(!cfg || !Array.isArray(cfg.hidden)) return "Panel config needs a hidden[] list";
  for(const p of cfg.hidden) if(!KNOWN_PANELS.includes(p)) return `Unknown panel "${p}"`;
  return null;
}
const rnd2 = v => Math.round((v||0)*100)/100;
export function buildBudgetPanels(raw){
  const data = Array.isArray(raw.data) ? raw.data : [];
  const variance = Array.isArray(raw.variance) ? raw.variance : [];
  const map = (raw.map && raw.map.structure) ? raw.map : {structure:{}, code_to_line:{}};
  if(!data.length) throw new Error("No budget lines found in the import");
  for(const r of data) if(!r || typeof r.dept!=="string" || !Array.isArray(r.phase))
    throw new Error("Budget lines are not in the expected format (dept/phase missing)");

  const sum = (arr,f)=>arr.reduce((a,r)=>a+(f(r)||0),0);
  const agg = (rows,key)=>{
    const m = new Map();
    for(const r of rows){
      const k = key(r);
      if(!m.has(k)) m.set(k,{b2627:0, rf2526:0, a2526:0, cont:0, n:0});
      const o = m.get(k);
      o.b2627+=r.b2627||0; o.rf2526+=r.rf2526||0; o.a2526+=r.a2526||0; o.cont+=r.cont||0; o.n++;
    }
    return m;
  };

  // org — department/activity aggregates only, no line-level detail
  const byDept = agg(data, r=>r.dept), byAct = agg(data, r=>r.act);
  const org = {
    totals: {b2627:rnd2(sum(data,r=>r.b2627)), rf2526:rnd2(sum(data,r=>r.rf2526)),
             a2526:rnd2(sum(data,r=>r.a2526)), lines:data.length,
             active:data.filter(r=>(r.b2627||0)!==0).length, depts:byDept.size},
    depts: [...byDept].map(([d,o])=>({dept:d, b2627:rnd2(o.b2627), rf2526:rnd2(o.rf2526), a2526:rnd2(o.a2526), n:o.n})),
    acts:  [...byAct].map(([a,o])=>({act:a, b2627:rnd2(o.b2627)})).filter(x=>x.b2627>0)
  };

  // holder — full line-level rows (descriptions/justifications included)
  const holder = {rows: data, depts: [...new Set(data.map(r=>r.dept))].sort()};

  // health — the upload checks, precomputed to the rows each list shows
  const hasPhase = r => r.phase.some(p=>p!==0);
  const phasedSum = r => rnd2(r.phase.reduce((a,b)=>a+(b||0),0));
  const lite = r => ({dept:r.dept, code:r.code, name:r.name, b2627:r.b2627});
  const dead = data.filter(r=>!(r.b2627||0) && !(r.a2526||0));
  const tiny = data.filter(r=>r.b2627 && Math.abs(r.b2627)<=5000);
  const noPhase = data.filter(r=>(r.b2627||0)!==0 && !hasPhase(r));
  const badPhase = data.filter(r=>hasPhase(r) && r.b2627!=null && Math.abs(phasedSum(r)-r.b2627)>1);
  const health = {
    counts: {dead:dead.length, tiny:tiny.length, noPhase:noPhase.length, badPhase:badPhase.length,
             total:data.length, over5k:data.length-dead.length-tiny.length},
    tinyTotal: rnd2(sum(tiny,r=>r.b2627)), totalB27: org.totals.b2627,
    tinyRows: tiny.map(lite).sort((a,b)=>a.b2627-b.b2627),
    badPhaseRows: badPhase.slice(0,20).map(r=>({...lite(r), phased:phasedSum(r)})),
    deadRows: dead.slice(0,20).map(lite)
  };

  // variance — the Xero monthly report rows + the mapping for the proposed-structure toggle
  const varPanel = {rows: variance, map};

  // structure — fully precomputed per reporting line (25/26 FY RF + 26/27 budget)
  const vby = {}; for(const r of variance) vby[r.code] = r;
  const b27by = {}; for(const r of data) if(r.code!=null) b27by[r.code] = rnd2((b27by[r.code]||0)+(r.b2627||0));
  const structure = {
    codes: Object.keys(map.code_to_line||{}).length,
    lines: Object.entries(map.structure).map(([name,s])=>({
      name, activity:s.activity, codes:s.codes,
      fyrf: rnd2(s.codes.reduce((t,c)=>t+((vby[c]&&vby[c].fy_rf)||0),0)),
      b27:  rnd2(s.codes.reduce((t,c)=>t+(b27by[c]||0),0))
    }))
  };

  return {"budget.org":org, "budget.holder":holder, "budget.health":health,
          "budget.variance":varPanel, "budget.structure":structure};
}

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

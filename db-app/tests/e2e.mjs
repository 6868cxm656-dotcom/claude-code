// End-to-end regression suite: real front-end (jsdom) against the real Worker
// with an in-memory D1 mock. Run: JSDOM_PATH=<path>/jsdom/lib/api.js node db-app/tests/e2e.mjs
const { JSDOM } = await import(process.env.JSDOM_PATH || 'jsdom');
import worker from '../worker.js';
import { makeDB } from './d1mock.mjs';
import { SEED_RISKS } from '../seed.mjs';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(join(here, '../public/index.html'), 'utf8');
const env = { DB: makeDB(), ASSETS:{ fetch:async()=>new Response('PAGE') } };

let pass=0, fail=0;
const ok=(c,m)=>{ if(c) pass++; else { fail++; console.log('FAIL:', m); } };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function browser(email, url='https://tcf.example/'){
  const w = new JSDOM(html, { runScripts:'dangerously', url,
    beforeParse(w){
      w.__failFetch=false; w.__htmlFetch=false;
      w.fetch = async (u, o={}) => {
        if(w.__failFetch) throw new TypeError('network down');
        if(w.__htmlFetch) return new Response('<html>login</html>', {status:200, headers:{'content-type':'text/html'}});
        return worker.fetch(new Request((String(u).startsWith('http')?'':'https://tcf.example')+u,
          {method:o.method||'GET', headers:Object.assign({'Cf-Access-Authenticated-User-Email':email}, o.headers||{}), body:o.body}), env);
      };
    }}).window;
  // drive the styled dialogs from tests
  w.__dlgText = 'note'; w.__dlgConfirm = true;
  w.askText = async ()=> w.__dlgText;
  w.askConfirm = async ()=> w.__dlgConfirm;
  return w;
}
const state = async email => (await (await worker.fetch(new Request('https://tcf.example/api/state',
  {headers:{'Cf-Access-Authenticated-User-Email':email}}), env)).json());

const JIM='jim.riddiford@churchillfellowship.org', NIK='nikesh.patel@churchillfellowship.org';
const jim = browser(JIM), nik = browser(NIK);
await sleep(350);
const d=w=>w.document;

// --- drift check: offline baseline literal === seed ---
const m = html.match(/BASELINE:BEGIN[\s\S]*?const BASELINE_RISKS = (\[[\s\S]*?\]);\n\/\* BASELINE:END/);
ok(m && JSON.stringify(JSON.parse(m[1]))===JSON.stringify(SEED_RISKS), 'baseline literal matches seed.mjs');

// --- identity & baseline ---
ok(d(jim).getElementById('whoami').textContent.includes('Jim'), 'Jim identity');
ok(d(nik).getElementById('whoami').textContent.includes('own areas'), 'Nikesh scoped');
ok(d(jim).querySelectorAll('#regBody tr').length===41, 'Jim sees 41 (incl. hidden R41)');
ok(d(nik).querySelectorAll('#regBody tr').length===40, 'Nikesh sees 40');
ok(d(jim).getElementById('loading').style.display==='none', 'loading overlay cleared');

// --- hidden risks: server enforcement + toggle via DOM click ---
ok(!(await state(NIK)).risks.find(r=>r.id==='R41'), 'R41 never sent to Nikesh');
const row=[...d(jim).querySelectorAll('#regBody tr')].find(t=>t.textContent.includes('R05'));
row.dispatchEvent(new jim.Event('click',{bubbles:true})); await sleep(30);
d(jim).getElementById('mHide').dispatchEvent(new jim.Event('click',{bubbles:true})); await sleep(350);
ok((await state(JIM)).risks.find(r=>r.id==='R05').hidden===true, 'hide click persists (with confirm dialog)');
ok(!(await state(NIK)).risks.find(r=>r.id==='R05'), 'hidden R05 stripped for Nikesh');

// --- leak checks ---
jim.showView('pack'); jim.renderPack();
d(jim).getElementById('pCom').value='Board'; d(jim).getElementById('pSince').value='2026-03-26'; jim.renderPack(true);
ok(!d(jim).getElementById('packBody').textContent.includes('R41'), 'pack excludes hidden');
d(jim).getElementById('chgFrom').value='2026-06-01'; d(jim).getElementById('chgTo').value='2026-06-30'; jim.renderChanges();
const chg = d(jim).getElementById('chgNew').textContent + d(jim).getElementById('chgChanged').textContent;
ok(!chg.includes('R41') && !chg.includes('R05'), 'change report excludes hidden');
jim.openModal('R05'); await jim.toggleHidden(); await sleep(250);   // un-hide for later tests

// --- proposal workflow: edit ---
nik.openModal('R07'); d(nik).getElementById('mImp').children[4].click();
nik.__dlgText='raise impact'; await nik.saveRisk(); await sleep(250);
ok((await state(JIM)).risks.find(r=>r.id==='R07').i===3, 'owner edit quarantined');
await jim.refreshState({force:true}); await sleep(50);
ok(jim.pendingList().length===1, 'proposal visible to admin');
await jim.approveProposal('R07'); await sleep(250);
ok((await state(NIK)).risks.find(r=>r.id==='R07').i===5, 'approval applies + syncs');

// --- proposal workflow: create new risk (exercises plain-INSERT id path) ---
nik.openModal(null);
d(nik).getElementById('mRiskTitle').value='New data-sharing risk';
await nik.saveRisk(); await sleep(250);
const created = (await state(JIM)).risks.find(r=>r.title==='New data-sharing risk');
ok(created && created.pendingNew===true && created.id==='R42', 'owner-created risk pending with next id ('+(created&&created.id)+')');
await jim.refreshState({force:true});
await jim.approveProposal(created.id); await sleep(250);
ok(!!(await state(NIK)).risks.find(r=>r.id===created.id), 'approved new risk live for others');

// --- reject flow with dialog ---
nik.openModal('R08'); d(nik).getElementById('mImp').children[4].click();
await nik.saveRisk(); await sleep(250);
await jim.refreshState({force:true});
jim.__dlgText='not justified';
await jim.rejectProposal('R08'); await sleep(250);
ok(!(await state(JIM)).risks.find(r=>r.id==='R08').pending, 'reject clears proposal');

// --- failure handling ---
jim.openModal('R36');
jim.__failFetch = true;
d(jim).getElementById('mHide').dispatchEvent(new jim.Event('click',{bubbles:true})); await sleep(200);
ok(d(jim).getElementById('apiBanner').style.display==='', 'banner shown on network failure');
ok(d(jim).getElementById('apiBanner').innerHTML.includes('Reload now'), 'banner offers reload');
ok((await state(JIM)).risks.find(r=>r.id==='R36').hidden!==true, 'no phantom change on failure');
jim.__failFetch = false; jim.closeModal();
jim.__htmlFetch = true;
const res = await jim.apiCall('POST','/api/risk/R36/flag',{note:'x'});
ok(res.ok===false && /expired/i.test(res.data.error), 'HTML login page => session-expired error');
jim.__htmlFetch = false;

// --- permission walls ---
const forb = await worker.fetch(new Request('https://tcf.example/api/risk/R36/visibility',
  {method:'POST', headers:{'Cf-Access-Authenticated-User-Email':NIK,'content-type':'application/json'}, body:JSON.stringify({hidden:true})}), env);
ok(forb.status===403, 'non-admin cannot toggle visibility');

// --- offline copy: read-only viewer ---
const off = browser(JIM, 'file:///register.html');
await sleep(250);
ok(d(off).getElementById('whoami').textContent.includes('read-only'), 'offline shows read-only banner');
ok(d(off).querySelectorAll('#regBody tr').length===40, 'offline viewer hides hidden risks (40)');
ok(d(off).getElementById('addBtn').style.display==='none', 'offline: no add button');
ok(d(off).getElementById('importBtn').style.display==='', 'offline: View a backup available');
off.openModal('R07');
ok(d(off).getElementById('mSave').style.display==='none' && d(off).getElementById('mHide').style.display==='none', 'offline modal fully read-only');


// --- MISSION CONTROL: shell, home, milestones ---
import { SEED_MILESTONES } from '../seed.mjs';
{
  const mm = html.match(/BASELINE-MS:BEGIN[\s\S]*?const BASELINE_MILESTONES = (\[[\s\S]*?\]);\n\/\* BASELINE-MS:END/);
  ok(mm && JSON.stringify(JSON.parse(mm[1]))===JSON.stringify(SEED_MILESTONES), 'milestone baseline matches seed');

  ok(d(nik).getElementById('view-home').classList.contains('active'), 'Home is the default view (fresh window)');
  ok(d(jim).querySelectorAll('#homeAmbitions .soap-card').length===3, 'home: 3 ambition cards');
  ok(d(jim).querySelectorAll('#homeShifts .soap-card').length===3, 'home: 3 shift cards');
  ok(d(jim).querySelectorAll('#homeEnablers .enabler-tile').length===8, 'home: 8 enabler tiles');
  ok((await state(JIM)).milestones.length===20, 'state carries 20 seeded milestones');

  jim.showModule('risk');
  ok(d(jim).getElementById('subNav').style.display==='', 'risk module reveals subnav');
  jim.showModule('milestones');
  ok(d(jim).querySelectorAll('#msBody .ms-row').length===20, 'milestones list renders 20');

  // owner live update (no QA gate): Nikesh updates his M01
  nik.showModule('milestones');
  nik.openMilestone('M01');
  ok(d(nik).getElementById('msmSave').style.display==='', 'Nikesh can edit his milestone');
  d(nik).getElementById('msmRag').value='At risk';
  d(nik).getElementById('msmProg').value='25';
  d(nik).getElementById('msmNote').value='Applications open; panel recruitment behind schedule';
  await nik.saveMilestone(); await sleep(250);
  const m01 = (await state(JIM)).milestones.find(x=>x.id==='M01');
  ok(m01.rag==='At risk' && m01.progress===25, 'owner milestone update is live immediately');
  ok(m01.history.some(h=>h.note && h.note.includes('panel recruitment')), 'update note logged');

  // Nikesh cannot edit Jim's milestone (UI + server)
  nik.openMilestone('M15');
  ok(d(nik).getElementById('msmSave').style.display==='none', 'Nikesh read-only on M15');
  nik.closeMilestone();
  const forbMs = await worker.fetch(new Request('https://tcf.example/api/milestone',
    {method:'POST', headers:{'Cf-Access-Authenticated-User-Email':NIK,'content-type':'application/json'},
     body:JSON.stringify({milestone:{id:'M15', title:'x', rag:'On track'}})}), env);
  ok(forbMs.status===403, 'server blocks non-owner milestone edit ('+forbMs.status+')');
  const delMs = await worker.fetch(new Request('https://tcf.example/api/milestone/M01',
    {method:'DELETE', headers:{'Cf-Access-Authenticated-User-Email':NIK}}), env);
  ok(delMs.status===403, 'milestone delete is admin-only');

  // admin edits any milestone
  await jim.refreshState({force:true});
  jim.openMilestone('M05');
  ok(d(jim).getElementById('msmSave').style.display==='', 'admin can edit any milestone');
  jim.closeMilestone();

  // pack includes milestones section
  jim.showModule('pack'); jim.renderPack();
  d(jim).getElementById('pCom').value='Board'; jim.renderPack(true);
  const packTxt = d(jim).getElementById('packBody').textContent;
  ok(packTxt.includes('Milestones') && packTxt.includes('M15'), 'Board pack includes milestones');

  // home rollup reflects the At-risk change
  jim.showModule('home');
  ok(d(jim).getElementById('homeKpis').textContent.includes('at risk'), 'home KPI shows at-risk count');

  // offline copy shows milestones read-only
  ok(d(off).querySelectorAll('#msBody .ms-row').length===20, 'offline shows 20 milestones');
  off.openMilestone('M01');
  ok(d(off).getElementById('msmSave').style.display==='none', 'offline milestone read-only');
}


// --- milestone timeline view ---
{
  jim.showModule('milestones');
  jim.setMsView('timeline');
  ok(d(jim).getElementById('msTimeline').style.display==='', 'timeline visible after toggle');
  ok(d(jim).getElementById('msBody').style.display==='none', 'list hidden in timeline view');
  const dots = d(jim).querySelectorAll('#msTimeline .tl-dot:not(.tl-legend .tl-dot)');
  ok(d(jim).querySelectorAll('#msTimeline .tl-lane .tl-dot').length===20, 'timeline renders 20 dots ('+d(jim).querySelectorAll('#msTimeline .tl-lane .tl-dot').length+')');
  ok(d(jim).querySelectorAll('#msTimeline .tl-months span').length===12, '12 month labels');
  ok(d(jim).querySelectorAll('#msTimeline .tl-legend .li').length>=4, 'legend has 4 statuses');
  // glyph secondary encoding present for the at-risk milestone (M01 set earlier)
  const atRisk = [...d(jim).querySelectorAll('#msTimeline .tl-lane .tl-dot')].find(x=>x.getAttribute('aria-label').startsWith('M01'));
  ok(atRisk && atRisk.textContent.trim()==='!', 'at-risk dot carries ! glyph (not colour-alone)');
  // dot click opens the milestone
  atRisk.dispatchEvent(new jim.Event('click',{bubbles:true}));
  ok(d(jim).getElementById('msOverlay').classList.contains('open') && d(jim).getElementById('msTitle').textContent.startsWith('M01'), 'dot click opens milestone');
  jim.closeMilestone();
  jim.setMsView('list');
  ok(d(jim).getElementById('msBody').style.display==='', 'toggle back to list');
}


// --- live priority engine on Home ---
{
  await jim.refreshState({force:true});
  jim.showModule('home');
  const cards = d(jim).querySelectorAll('#homePriorities .prio');
  ok(cards.length>=3 && cards.length<=5, 'priority cards generated ('+cards.length+')');
  const txt = d(jim).getElementById('homePriorities').textContent;
  ok(txt.includes('R11'), 'top appetite breach (R11) drives a priority');
  ok(txt.includes('M01'), 'at-risk milestone M01 drives a priority');
  ok(txt.includes('TBC'), 'TBC strategy targets surface before 1 Oct');
  ok(d(jim).getElementById('homePrioNote').textContent.includes('recalculated'), 'note explains live generation');
  // dynamism: mark M01 off track -> its area should gain weight and text update
  jim.openMilestone('M01');
  d(jim).getElementById('msmRag').value='Off track';
  await jim.saveMilestone(); await sleep(250);
  jim.showModule('home');
  ok(d(jim).getElementById('homePriorities').textContent.includes('off track'), 'engine reacts to live data change');
  // static block gone from Overview; pointer present
  jim.showModule('risk');
  ok(!d(jim).getElementById('view-overview').textContent.includes('Biggest organisational priorities'), 'static list removed from Overview');
  ok(d(jim).getElementById('view-overview').textContent.includes('generated live'), 'Overview points to Home');
}


// --- view-as + access control module ---
{
  // server: admin viewAs strips hidden and reports impersonation
  const va = await (await worker.fetch(new Request('https://tcf.example/api/state?viewAs=Nikesh',
    {headers:{'Cf-Access-Authenticated-User-Email':JIM}}), env)).json();
  ok(!va.risks.find(r=>r.id==='R41'), 'viewAs=Nikesh strips hidden R41 for Jim');
  ok(va.me.viewAs==='Nikesh' && va.me.admin===false && va.me.realAdmin===true, 'viewAs identity fields');
  // non-admin viewAs is ignored
  const nva = await (await worker.fetch(new Request('https://tcf.example/api/state?viewAs=Jim',
    {headers:{'Cf-Access-Authenticated-User-Email':NIK}}), env)).json();
  ok(!nva.me.viewAs && nva.me.role==='Nikesh', 'non-admin viewAs ignored');
  // people + catOwner in state; access only for admins
  const js = await state(JIM);
  ok(Array.isArray(js.people) && js.people.length>=5 && js.catOwner['2']==='Nikesh', 'people + catOwner in state');
  const ns = await state(NIK);
  ok(ns.access===undefined, 'raw access config hidden from non-admins');

  // PUT /api/access walls
  const put = (email, cfg) => worker.fetch(new Request('https://tcf.example/api/access',
    {method:'PUT', headers:{'Cf-Access-Authenticated-User-Email':email,'content-type':'application/json'},
     body:JSON.stringify({access:cfg})}), env);
  const baseUsers = js.people.map(p=>({email:p.email, name:p.name, group:p.group}));
  ok((await put(NIK, {users:baseUsers, catOwner:js.catOwner})).status===403, 'access PUT admin-only');
  ok((await put(JIM, {users:baseUsers.map(u=>({...u, group:'editor'})), catOwner:js.catOwner})).status===400, 'lockout guard: no admins rejected');
  ok((await put(JIM, {users:baseUsers.map(u=>u.name==='Jim'?{...u,group:'editor'}:u), catOwner:js.catOwner})).status===400, 'cannot demote yourself');
  // valid change: add Katherine as editor and give her category 3
  const newUsers = baseUsers.concat([{email:'katherine.x@churchillfellowship.org', name:'Katherine', group:'editor'}]);
  const okPut = await put(JIM, {users:newUsers, catOwner:{...js.catOwner, "3":"Katherine"}});
  ok(okPut.status===200, 'valid access config accepted');
  const kState = await state('katherine.x@churchillfellowship.org');
  ok(kState.me.role==='Katherine' && kState.catOwner['3']==='Katherine', 'new user recognised; area 3 reassigned');
  // Katherine can now propose in area 3
  const kPost = await worker.fetch(new Request('https://tcf.example/api/risk',
    {method:'POST', headers:{'Cf-Access-Authenticated-User-Email':'katherine.x@churchillfellowship.org','content-type':'application/json'},
     body:JSON.stringify({risk:{l2:'3.1', com:'Board', l:2, i:2, title:'Katherine test risk', desc:'x', controls:[], actions:[], status:'Open', review:'', draft:true}})}), env);
  const kj = await kPost.json();
  ok(kPost.status===200 && kj.proposal===true, 'reassigned owner can propose in area 3');
  // restore original config for later tests
  ok((await put(JIM, {users:baseUsers, catOwner:js.catOwner})).status===200, 'config restored');

  // front-end: view-as flow
  await jim.refreshState({force:true}); await sleep(60);
  ok(d(jim).getElementById('viewAsSel').style.display==='', 'view-as selector visible for admin');
  ok(d(nik).getElementById('viewAsSel').style.display==='none', 'selector hidden for non-admin');
  jim.setViewAs('Nikesh'); await sleep(250);
  ok(d(jim).getElementById('vaBanner').style.display==='', 'view-as banner shown');
  ok(!d(jim).querySelector('#regBody').innerHTML.includes('R41'), 'hidden risk gone in view-as');
  ok(d(jim).getElementById('mod-access').style.display==='none', 'Access module hidden in view-as');
  await jim.saveRisk();
  ok(d(jim).getElementById('toast').textContent.includes('read-only preview'), 'writes blocked in view-as');
  jim.setViewAs(''); await sleep(250);
  ok(d(jim).getElementById('vaBanner').style.display==='none', 'exit restores normal mode');
  ok(d(jim).querySelector('#regBody').innerHTML.includes('R41'), 'hidden risk back after exit');

  // front-end: access module renders
  jim.showModule('access');
  ok(d(jim).querySelectorAll('#accUsers tr').length>=5, 'access users table renders');
  ok(d(jim).querySelectorAll('#accCats .enabler-tile').length===8, '8 ownership tiles');
  ok(d(jim).querySelectorAll('#accMatrix tbody tr').length===12, 'capability matrix 12 rows');
}


// --- backups: snapshots, restore, re-seed tripwire ---
{
  const apiJ = (method, path, body) => worker.fetch(new Request('https://tcf.example'+path,
    {method, headers:{'Cf-Access-Authenticated-User-Email':JIM,'content-type':'application/json'},
     body: body?JSON.stringify(body):undefined}), env);
  const apiN = (method, path, body) => worker.fetch(new Request('https://tcf.example'+path,
    {method, headers:{'Cf-Access-Authenticated-User-Email':NIK,'content-type':'application/json'},
     body: body?JSON.stringify(body):undefined}), env);

  // fresh-seed tripwire: this test DB was seeded this run and has no backup yet
  await jim.refreshState({force:true}); await sleep(60);
  ok(d(jim).getElementById('seedBanner').style.display==='', 'tripwire banner shows on freshly-seeded DB with no backup');
  ok(d(nik).getElementById('seedBanner').style.display==='none', 'tripwire banner is admin-only');

  // permission walls
  ok((await apiN('POST','/api/snapshot',{})).status===403, 'snapshot take is admin-only');
  ok((await apiN('GET','/api/snapshots')).status===403, 'snapshot list is admin-only');

  // take one from the UI; tripwire clears; list renders
  jim.showModule('access'); await sleep(150);
  await jim.takeSnapshotNow(); await sleep(250);
  const list1 = await (await apiJ('GET','/api/snapshots')).json();
  ok(list1.snapshots.length>=1 && list1.snapshots[0].bytes>1000, 'snapshot taken and listed with size');
  ok(d(jim).getElementById('seedBanner').style.display==='none', 'tripwire clears once a backup exists');
  ok(d(jim).getElementById('accSnaps').textContent.includes('Restore'), 'backups table renders in Access module');
  const ts = list1.snapshots[0].ts;

  // download route returns the full raw state
  const dl = await (await apiJ('GET','/api/snapshot/'+encodeURIComponent(ts))).json();
  ok(Array.isArray(dl.risks) && dl.risks.length>=40 && Array.isArray(dl.milestones) && dl.settings, 'snapshot download contains full state');

  // mutate data AND access config after the snapshot…
  ok((await apiJ('POST','/api/risk/R06/visibility',{hidden:true})).status===200, 'post-snapshot mutation applied');
  const jsNow = await state(JIM);
  const usersNow = jsNow.people.map(p=>({email:p.email, name:p.name, group:p.group}))
    .concat([{email:'katherine.x@churchillfellowship.org', name:'Katherine', group:'editor'}]);
  ok((await apiJ('PUT','/api/access',{access:{users:usersNow, catOwner:jsNow.catOwner}})).status===200, 'post-snapshot access change applied');

  // …restore: data reverts, access config survives, safety snapshot taken first
  ok((await apiN('POST','/api/snapshot/'+encodeURIComponent(ts)+'/restore',{})).status===403, 'restore is admin-only');
  await sleep(5);
  ok((await apiJ('POST','/api/snapshot/'+encodeURIComponent(ts)+'/restore',{})).status===200, 'restore succeeds');
  ok((await state(JIM)).risks.find(r=>r.id==='R06').hidden!==true, 'restore reverts post-snapshot data change');
  ok((await state('katherine.x@churchillfellowship.org')).me.role==='Katherine', 'restore keeps the CURRENT access config (no lockout from old configs)');
  const list2 = await (await apiJ('GET','/api/snapshots')).json();
  ok(list2.snapshots.length>list1.snapshots.length, 'restore left a safety snapshot of the pre-restore state');
  ok((await apiJ('POST','/api/snapshot/nonsense/restore',{})).status===404, 'restoring an unknown snapshot is a 404');

  // the daily cron entry point works
  await sleep(5);
  await worker.scheduled({}, env, {});
  const list3 = await (await apiJ('GET','/api/snapshots')).json();
  ok(list3.snapshots.length>list2.snapshots.length, 'scheduled (cron) handler takes a snapshot');

  // put the access config back for any later tests
  const baseUsers = jsNow.people.map(p=>({email:p.email, name:p.name, group:p.group}));
  ok((await apiJ('PUT','/api/access',{access:{users:baseUsers, catOwner:jsNow.catOwner}})).status===200, 'access config restored');
}


// --- budget module: import, panel hiding (server-side stripping), restore semantics ---
{
  const apiAs = (email, method, path, body) => worker.fetch(new Request('https://tcf.example'+path,
    {method, headers:{'Cf-Access-Authenticated-User-Email':email,'content-type':'application/json'},
     body: body?JSON.stringify(body):undefined}), env);
  const BUD = {
    data: [
      {dept:"100 - Programmes", cls:"UR", act:"Fellowship Grant Awards", typ:"Grants", code:5010, name:"Fellowship grants", b2526:900000, rf2526:1000000, a2526:400000, b2627:1200000, cont:0, desc:"120 Fellowships at ~10k average", phase:[0,0,0,0,0,0,300000,300000,300000,300000,0,0]},
      {dept:"100 - Programmes", cls:"UR", act:"Direct Programme Staffing", typ:"Staff", code:6010, name:"Programme salaries", b2526:400000, rf2526:420000, a2526:230000, b2627:450000, cont:0, desc:"", phase:[37500,37500,37500,37500,37500,37500,37500,37500,37500,37500,37500,37500]},
      {dept:"200 - Support", cls:"UR", act:"Support Staffing", typ:"Staff", code:8010, name:"Support salaries", b2526:300000, rf2526:310000, a2526:150000, b2627:330000, cont:10000, desc:"SENSITIVE-SALARY-BREAKDOWN", phase:[27500,27500,27500,27500,27500,27500,27500,27500,27500,27500,27500,27500]},
      {dept:"200 - Support", cls:"UR", act:"Support Operational", typ:"Ops", code:8110, name:"Office costs", b2526:50000, rf2526:50000, a2526:30000, b2627:3000, cont:0, desc:"", phase:[3000,0,0,0,0,0,0,0,0,0,0,0]},
      {dept:"200 - Support", cls:"UR", act:"Support Operational", typ:"Ops", code:8120, name:"Old subscriptions", b2526:5000, rf2526:0, a2526:0, b2627:0, cont:0, desc:"", phase:[0,0,0,0,0,0,0,0,0,0,0,0]},
      {dept:"100 - Programmes", cls:"UR", act:"Direct Programme Operational", typ:"Ops", code:6150, name:"Programme events", b2526:80000, rf2526:80000, a2526:20000, b2627:90000, cont:0, desc:"", phase:[0,0,45000,0,0,0,0,0,0,0,0,0]}
    ],
    variance: [
      {section:"Charitable Income", group:"Donations", code:4110, name:"Individual giving", fy_budget:500000, fy_rf:520000, ytd_rf:390000, ytd_act:420000, var:30000, var_pct:0.0769},
      {section:"Charitable Expenditure", group:"Grants", code:5010, name:"Fellowship grants", fy_budget:1000000, fy_rf:1000000, ytd_rf:700000, ytd_act:760000, var:60000, var_pct:0.0857},
      {section:"Charitable Expenditure", group:"Grants", code:5020, name:"Activate grants", fy_budget:100000, fy_rf:100000, ytd_rf:75000, ytd_act:75500, var:500, var_pct:0.0067},
      {section:"Unmapped Accounts", group:null, code:9999, name:"Suspense", fy_budget:0, fy_rf:0, ytd_rf:0, ytd_act:1234, var:1234, var_pct:0}
    ],
    map: {structure:{"Fellowship grants":{activity:"Fellowship Grant Awards", codes:[5010,5020]},
                     "Individual giving":{activity:"Philanthropy & Partnerships", codes:[4110]}},
          code_to_line:{"5010":"Fellowship grants","5020":"Fellowship grants","4110":"Individual giving"}}
  };

  // parseBudgetImport handles all three accepted shapes
  const builtHtml = '<title>x</title>\n<script>\nconst DATA = ' + JSON.stringify(BUD.data) +
    ';\nconst VAR = ' + JSON.stringify(BUD.variance) + ';      // monthly report\nconst MAP = ' +
    JSON.stringify(BUD.map) + ';      // proposed structure\n</scr' + 'ipt>';
  const parsed = jim.parseBudgetImport(builtHtml);
  ok(parsed.data.length===6 && parsed.variance.length===4 && parsed.map.code_to_line['5010']==='Fellowship grants',
    'parseBudgetImport extracts payloads from a built dashboard.html');
  ok(jim.parseBudgetImport(JSON.stringify({data:BUD.data})).data.length===6, 'parseBudgetImport accepts a JSON object');
  ok(jim.parseBudgetImport(JSON.stringify(BUD.data)).data.length===6, 'parseBudgetImport accepts a bare JSON array');
  let parseErr = null; try{ jim.parseBudgetImport('<html>nothing here</html>'); }catch(e){ parseErr = e; }
  ok(!!parseErr, 'parseBudgetImport rejects a file with no payloads');

  // import walls + validation
  ok((await apiAs(NIK,'POST','/api/budget',{budget:BUD})).status===403, 'budget import is admin-only');
  ok((await apiAs(JIM,'POST','/api/budget',{budget:{data:[{bad:1}]}})).status===400, 'malformed budget import rejected');
  const imp = await (await apiAs(JIM,'POST','/api/budget',{budget:BUD})).json();
  ok(imp.ok===true && imp.meta.lines===6 && imp.meta.varianceLines===4, 'admin import succeeds with counts');

  // everyone sees all five panels while nothing is hidden
  const nb0 = await (await apiAs(NIK,'GET','/api/budget')).json();
  ok(Object.keys(nb0.panels).length===5 && nb0.hidden===undefined, 'non-admin gets all 5 panels, no hidden list');
  ok((await state(NIK)).budget.visible===5, 'state flags 5 visible panels for editor');

  // panel hiding: walls, validation, server-side stripping
  ok((await apiAs(NIK,'PUT','/api/panels',{panels:{hidden:['budget.holder']}})).status===403, 'panel hiding is admin-only');
  ok((await apiAs(JIM,'PUT','/api/panels',{panels:{hidden:['budget.nonsense']}})).status===400, 'unknown panel id rejected');
  ok((await apiAs(JIM,'PUT','/api/panels',{panels:{hidden:['budget.holder']}})).status===200, 'admin hides the budget-holder panel');
  const nb1res = await apiAs(NIK,'GET','/api/budget');
  const nb1txt = await nb1res.text(); const nb1 = JSON.parse(nb1txt);
  ok(!nb1.panels['budget.holder'] && Object.keys(nb1.panels).length===4, 'hidden panel absent for non-admin');
  ok(!nb1txt.includes('SENSITIVE-SALARY-BREAKDOWN'), 'hidden panel data never leaves the server for non-admins');
  const jb1 = await (await apiAs(JIM,'GET','/api/budget')).json();
  ok(jb1.panels['budget.holder'] && jb1.hidden.includes('budget.holder'), 'admin still sees the hidden panel + hidden list');
  ok((await state(NIK)).budget.visible===4 && (await state(JIM)).budget.visible===5, 'state visible counts reflect hiding');

  // view-as previews the stripped payload for admins
  const vaBud = await (await worker.fetch(new Request('https://tcf.example/api/budget?viewAs=Nikesh',
    {headers:{'Cf-Access-Authenticated-User-Email':JIM}}), env)).json();
  ok(!vaBud.panels['budget.holder'] && vaBud.hidden===undefined, 'view-as strips hidden panels for the admin preview');

  // front-end: nav visibility + tabs + hidden marker + admin toolbar
  await jim.refreshState({force:true}); await nik.refreshState({force:true}); await sleep(60);
  ok(d(jim).getElementById('mod-budget').style.display==='', 'budget nav visible for admin');
  ok(d(nik).getElementById('mod-budget').style.display==='', 'budget nav visible for editor');
  jim.showModule('budget'); await sleep(250);
  ok(d(jim).querySelectorAll('#budTabs button').length===5, 'admin sees all 5 panel tabs');
  ok(d(jim).getElementById('budTabs').textContent.includes('\u{1F648}'), 'hidden panel marked for admin');
  ok(d(jim).getElementById('budAdmin').textContent.includes('Import budget data'), 'admin toolbar renders');
  ok(d(jim).getElementById('budBody').textContent.includes('26/27'), 'organisation overview renders');
  nik.showModule('budget'); await sleep(250);
  ok(d(nik).querySelectorAll('#budTabs button').length===4, 'editor sees 4 tabs (hidden panel gone)');
  ok(!d(nik).getElementById('budTabs').textContent.includes('Budget holder'), 'hidden tab label absent for editor');
  ok(d(nik).getElementById('budAdmin').innerHTML==='', 'no admin toolbar for editor');
  // front-end unhide via the admin toggle
  await jim.toggleBudPanel('budget.holder'); await sleep(250);
  const nb2 = await (await apiAs(NIK,'GET','/api/budget')).json();
  ok(Object.keys(nb2.panels).length===5, 'front-end unhide toggle restores the panel for everyone');

  // restore semantics: budget data IS restored, panel visibility is NOT
  await apiAs(JIM,'PUT','/api/panels',{panels:{hidden:['budget.health']}});
  await sleep(5);
  const snapB = (await (await apiAs(JIM,'POST','/api/snapshot',{})).json()).snapshot.ts;
  await apiAs(JIM,'PUT','/api/panels',{panels:{hidden:[]}});                       // unhide after the snapshot
  ok((await apiAs(JIM,'DELETE','/api/budget')).status===200, 'admin can remove budget data');
  ok((await state(NIK)).budget.present===false, 'budget gone after delete');
  await sleep(5);
  ok((await apiAs(JIM,'POST','/api/snapshot/'+encodeURIComponent(snapB)+'/restore',{})).status===200, 'restore succeeds');
  const nb3 = await (await apiAs(NIK,'GET','/api/budget')).json();
  ok(nb3.present===true && Object.keys(nb3.panels).length===5,
    'restore brings budget data back AND keeps current panel visibility (health not re-hidden)');
}


// --- sign-in (JWT) verification — isolated environment with a real RSA keypair ---
{
  const env2 = { DB: makeDB(), ASSETS:{ fetch:async()=>new Response('PAGE') } };
  const TEAM='testteam', AUD='a'.repeat(64);
  const genKey = () => crypto.subtle.generateKey(
    {name:'RSASSA-PKCS1-v1_5', modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256'},
    true, ['sign','verify']);
  const kp = await genKey(), rogue = await genKey();
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  pubJwk.kid='test-key-1'; pubJwk.use='sig'; pubJwk.alg='RS256';
  const b64u = s => Buffer.from(s).toString('base64url');
  async function sign(payload, key=kp.privateKey, kid='test-key-1'){
    const hp = b64u(JSON.stringify({alg:'RS256', kid})) + '.' + b64u(JSON.stringify(payload));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(hp));
    return hp + '.' + Buffer.from(sig).toString('base64url');
  }
  const claims = (email, over={}) => ({iss:'https://'+TEAM+'.cloudflareaccess.com', aud:[AUD], email,
    exp:Math.floor(Date.now()/1000)+600, ...over});
  // the worker fetches Cloudflare's JWKS once — serve our test key from a patched global fetch
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => String(u).includes(TEAM+'.cloudflareaccess.com/cdn-cgi/access/certs')
    ? new Response(JSON.stringify({keys:[pubJwk]}), {headers:{'content-type':'application/json'}})
    : realFetch(u, o);
  const api = (email, method, path, body, jwt) => worker.fetch(new Request('https://tcf.example'+path,
    {method, headers:Object.assign({'content-type':'application/json'},
        email?{'Cf-Access-Authenticated-User-Email':email}:{}, jwt?{'Cf-Access-Jwt-Assertion':jwt}:{}),
     body: body?JSON.stringify(body):undefined}), env2);

  const st0 = await (await api(JIM,'GET','/api/state')).json();
  ok(st0.security && st0.security.jwtEnforced===false, 'verification is off by default (header fallback)');
  const users = st0.people.map(p=>({email:p.email, name:p.name, group:p.group}));

  // lockout guards on enabling
  ok((await api(JIM,'PUT','/api/access',{access:{users, catOwner:st0.catOwner, teamDomain:TEAM, aud:AUD}})).status===400,
    'refuses to enable when the admin\'s own request has no verifiable token');
  ok((await api(JIM,'PUT','/api/access',{access:{users, catOwner:st0.catOwner, teamDomain:TEAM}})).status===400,
    'team domain without an AUD tag is rejected');
  // enable with a valid token (pasting the full team URL is normalised to the domain)
  const en = await api(JIM,'PUT','/api/access',
    {access:{users, catOwner:st0.catOwner, teamDomain:'https://'+TEAM+'.cloudflareaccess.com', aud:AUD}},
    await sign(claims(JIM)));
  ok(en.status===200, 'verification enabled with a valid token ('+en.status+')');

  // enforced: the header alone is no longer trusted
  ok((await api(JIM,'GET','/api/state')).status===401, 'header-only request rejected once enforced');
  const stJwt = await (await api('spoof@evil.example','GET','/api/state', null, await sign(claims(NIK)))).json();
  ok(stJwt.me && stJwt.me.email===NIK && stJwt.me.role==='Nikesh', 'identity comes from the verified token, not the header');
  ok(stJwt.security.jwtEnforced===true, 'state reports enforcement is on');
  ok(!stJwt.risks.find(r=>r.id==='R41'), 'hidden risks still stripped under JWT identity');

  // attack tokens all bounce
  const good = await sign(claims(JIM));
  const parts = good.split('.');
  const forged = parts[0]+'.'+b64u(JSON.stringify(claims('attacker@evil.example')))+'.'+parts[2];
  ok((await api(null,'GET','/api/state', null, forged)).status===401, 'tampered payload rejected');
  ok((await api(null,'GET','/api/state', null, await sign(claims(JIM), rogue.privateKey))).status===401, 'token signed by a rogue key rejected');
  ok((await api(null,'GET','/api/state', null, await sign(claims(JIM), rogue.privateKey, 'other-kid'))).status===401, 'unknown signing key rejected');
  ok((await api(null,'GET','/api/state', null, await sign(claims(JIM,{exp:Math.floor(Date.now()/1000)-10})))).status===401, 'expired token rejected');
  ok((await api(null,'GET','/api/state', null, await sign(claims(JIM,{aud:['something-else']})))).status===401, 'wrong audience rejected');
  ok((await api(null,'GET','/api/state', null, await sign(claims(JIM,{iss:'https://otherteam.cloudflareaccess.com'})))).status===401, 'wrong issuer rejected');

  // switching off requires a verified request too, then the header fallback returns
  ok((await api(JIM,'PUT','/api/access',{access:{users, catOwner:st0.catOwner}}, await sign(claims(JIM)))).status===200, 'verification switched off (both fields cleared)');
  ok((await api(JIM,'GET','/api/state')).status===200, 'header fallback works again after disabling');

  globalThis.fetch = realFetch;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);

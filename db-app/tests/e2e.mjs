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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);

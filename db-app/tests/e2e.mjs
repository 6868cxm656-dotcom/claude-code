// End-to-end regression suite: real front-end (jsdom) against the real Worker
// with an in-memory D1 mock. Run: node db-app/tests/e2e.mjs  (needs jsdom on NODE_PATH
// or installed alongside; CI-free, no network).
const { JSDOM } = await import(process.env.JSDOM_PATH || 'jsdom');
import worker from '../worker.js';
import { makeDB } from './d1mock.mjs';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(join(here, '../public/index.html'), 'utf8');
const env = { DB: makeDB(), ASSETS:{ fetch:async()=>new Response('PAGE') } };

let pass=0, fail=0;
const ok=(c,m)=>{ if(c) pass++; else { fail++; console.log('FAIL:', m); } };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function browser(email, opts={}){
  return new JSDOM(html, { runScripts:'dangerously', url:'https://tcf.example/',
    beforeParse(w){
      w.__promptReply='note'; w.__failFetch=false; w.__htmlFetch=false;
      w.fetch = async (url, o={}) => {
        if(w.__failFetch) throw new TypeError('network down');
        if(w.__htmlFetch) return new Response('<html>login</html>', {status:200, headers:{'content-type':'text/html'}});
        return worker.fetch(new Request((String(url).startsWith('http')?'':'https://tcf.example')+url,
          {method:o.method||'GET', headers:Object.assign({'Cf-Access-Authenticated-User-Email':email}, o.headers||{}), body:o.body}), env);
      };
      w.prompt=()=>w.__promptReply; w.confirm=()=>true;
    }}).window;
}
const state = async email => (await (await worker.fetch(new Request('https://tcf.example/api/state',
  {headers:{'Cf-Access-Authenticated-User-Email':email}}), env)).json());

const JIM='jim.riddiford@churchillfellowship.org', NIK='nikesh.patel@churchillfellowship.org';
const jim = browser(JIM), nik = browser(NIK);
await sleep(300);
const d=w=>w.document;

// --- identity & baseline ---
ok(d(jim).getElementById('whoami').textContent.includes('Jim'), 'Jim identity');
ok(d(nik).getElementById('whoami').textContent.includes('own areas'), 'Nikesh scoped');
ok(d(jim).querySelectorAll('#regBody tr').length===41, 'Jim sees 41 (incl. hidden R41)');
ok(d(nik).querySelectorAll('#regBody tr').length===40, 'Nikesh sees 40');

// --- hidden risks: server enforcement ---
ok(!(await state(NIK)).risks.find(r=>r.id==='R41'), 'R41 never sent to Nikesh');
ok((await state(JIM)).risks.find(r=>r.id==='R41').hidden===true, 'R41 hidden for Jim');

// --- hide toggle via real DOM clicks ---
const row=[...d(jim).querySelectorAll('#regBody tr')].find(t=>t.textContent.includes('R05'));
row.dispatchEvent(new jim.Event('click',{bubbles:true})); await sleep(30);
d(jim).getElementById('mHide').dispatchEvent(new jim.Event('click',{bubbles:true})); await sleep(300);
ok((await state(JIM)).risks.find(r=>r.id==='R05').hidden===true, 'hide click persists');
ok(!(await state(NIK)).risks.find(r=>r.id==='R05'), 'hidden R05 stripped for Nikesh');

// --- leak checks: pack + change report exclude hidden even for admins ---
jim.showView('pack'); jim.renderPack();
d(jim).getElementById('pCom').value='Board'; d(jim).getElementById('pSince').value='2026-03-26'; jim.renderPack(true);
ok(!d(jim).getElementById('packBody').textContent.includes('R41'), 'pack excludes hidden');
d(jim).getElementById('chgFrom').value='2026-06-01'; d(jim).getElementById('chgTo').value='2026-06-30'; jim.renderChanges();
const chg = d(jim).getElementById('chgNew').textContent + d(jim).getElementById('chgChanged').textContent;
ok(!chg.includes('R41') && !chg.includes('R05'), 'change report excludes hidden');
ok(!jim.sharedList().find(r=>r.hidden), 'CSV source excludes hidden');

// un-hide R05 for later tests
jim.openModal('R05'); await jim.toggleHidden(); await sleep(200);

// --- proposal workflow ---
nik.openModal('R07'); d(nik).getElementById('mImp').children[4].click();
nik.__promptReply='raise impact'; await nik.saveRisk(); await sleep(200);
ok((await state(JIM)).risks.find(r=>r.id==='R07').i===3, 'owner edit quarantined');
await jim.refreshState({force:true}); await sleep(50);
ok(jim.pendingList().length===1, 'proposal visible to admin');
await jim.approveProposal('R07'); await sleep(200);
ok((await state(NIK)).risks.find(r=>r.id==='R07').i===5, 'approval applies + syncs');

// --- failure handling: network down must fail loudly, not silently ---
jim.openModal('R36');
jim.__failFetch = true;
d(jim).getElementById('mHide').dispatchEvent(new jim.Event('click',{bubbles:true})); await sleep(150);
ok(d(jim).getElementById('apiBanner').style.display==='', 'banner shown on network failure');
ok(d(jim).getElementById('toast').textContent.includes("Can't reach"), 'error toast on failure');
ok((await state(JIM)).risks.find(r=>r.id==='R36').hidden!==true, 'no phantom change on failure');
jim.__failFetch = false; jim.closeModal();

// --- session expiry: HTML response detected, not treated as success ---
jim.__htmlFetch = true;
const res = await jim.apiCall('POST','/api/risk/R36/flag',{note:'x'});
ok(res.ok===false && /expired/i.test(res.data.error), 'HTML login page => session-expired error');
jim.__htmlFetch = false;

// --- permission walls (server) ---
const forb = await worker.fetch(new Request('https://tcf.example/api/risk/R36/visibility',
  {method:'POST', headers:{'Cf-Access-Authenticated-User-Email':NIK,'content-type':'application/json'}, body:JSON.stringify({hidden:true})}), env);
ok(forb.status===403, 'non-admin cannot toggle visibility');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);

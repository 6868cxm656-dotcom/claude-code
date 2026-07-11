// Minimal in-memory D1 mock sufficient for the worker's queries.
export function makeDB(){
  const risks = new Map(), deleted = new Map(), settings = new Map(), milestones = new Map(), snapshots = new Map();
  function run(sql, args){
    sql = sql.replace(/\s+/g,' ').trim();
    if(/INTO snapshots/i.test(sql)){ const [ts,data]=args; snapshots.set(ts,{ts,data}); return {}; }
    if(/^DELETE FROM snapshots WHERE ts NOT IN/i.test(sql)){
      const keepN = +(sql.match(/LIMIT (\d+)/)||[])[1] || 30;
      const keep = new Set([...snapshots.keys()].sort().reverse().slice(0,keepN));
      for(const ts of [...snapshots.keys()]) if(!keep.has(ts)) snapshots.delete(ts);
      return {};
    }
    // full-table clears used by restoreSnapshot
    if(/^DELETE FROM risks$/i.test(sql)){ risks.clear(); return {}; }
    if(/^DELETE FROM deleted$/i.test(sql)){ deleted.clear(); return {}; }
    if(/^DELETE FROM milestones$/i.test(sql)){ milestones.clear(); return {}; }
    if(/INTO milestones/i.test(sql)){
      const [id,owner,soap,updated,data] = args;
      milestones.set(id, {id,owner,soap,updated,data});
      return {};
    }
    if(/^DELETE FROM milestones WHERE id=\?/i.test(sql)){ milestones.delete(args[0]); return {}; }
    if(/^INSERT (OR (IGNORE|REPLACE) )?INTO risks/i.test(sql)){
      const [id,committee,l2,updated,data] = args; // matches both seed (5 args) & upsert(6 args w/ pending_new)
      // upsert form: id,committee,l2,updated,pending_new,data
      if(args.length===6){ const [i2,c2,l22,u2,pn,d2]=args; risks.set(i2,{id:i2,committee:c2,l2:l22,updated:u2,pending_new:pn,data:d2}); }
      else risks.set(id,{id,committee,l2,updated,pending_new:0,data});
      return {};
    }
    if(/^DELETE FROM risks WHERE id=\?/i.test(sql)){ risks.delete(args[0]); return {}; }
    if(/^INSERT OR REPLACE INTO deleted/i.test(sql)){ const [id,da,data]=args; deleted.set(id,{id,deleted_at:da,data}); return {}; }
    if(/^INSERT OR REPLACE INTO settings/i.test(sql)){
      const km = sql.match(/VALUES \('(\w+)'/); const key = km ? km[1] : 'global';
      const lit = sql.match(/VALUES \('\w+','([^']*)'\)/);
      settings.set(key, args.length ? args[0] : (lit ? lit[1] : ''));
      return {}; }
    if(/^DELETE FROM settings WHERE k='(\w+)'/i.test(sql)){ settings.delete(sql.match(/k='(\w+)'/)[1]); return {}; }
    return {};
  }
  function first(sql,args){
    sql=sql.replace(/\s+/g,' ').trim();
    if(/SELECT COUNT\(\*\) AS n FROM risks/i.test(sql)) return {n:risks.size};
    if(/SELECT COUNT\(\*\) AS n FROM milestones/i.test(sql)) return {n:milestones.size};
    if(/SELECT data FROM milestones WHERE id=\?/i.test(sql)){ const r=milestones.get(args[0]); return r?{data:r.data}:null; }
    if(/SELECT data FROM risks WHERE id=\?/i.test(sql)){ const r=risks.get(args[0]); return r?{data:r.data}:null; }
    if(/SELECT data FROM snapshots WHERE ts=\?/i.test(sql)){ const s=snapshots.get(args[0]); return s?{data:s.data}:null; }
    if(/SELECT MAX\(ts\) AS t FROM snapshots/i.test(sql)){ const ks=[...snapshots.keys()].sort(); return {t: ks.length?ks[ks.length-1]:null}; }
    const skm = sql.match(/SELECT v FROM settings WHERE k='(\w+)'/i);
    if(skm){ const v=settings.get(skm[1]); return (v!==undefined && v!=='')?{v}:null; }
    return null;
  }
  function all(sql){
    sql=sql.replace(/\s+/g,' ').trim();
    const kin = sql.match(/^SELECT k,v FROM settings WHERE k IN \(([^)]*)\)/i);
    if(kin){
      const keys = [...kin[1].matchAll(/'(\w+)'/g)].map(x=>x[1]);
      return {results: keys.filter(k=>settings.has(k) && settings.get(k)!=='').map(k=>({k, v:settings.get(k)}))};
    }
    if(/SELECT data FROM risks$/i.test(sql)) return {results:[...risks.values()].map(r=>({data:r.data}))};
    if(/SELECT data FROM milestones$/i.test(sql)) return {results:[...milestones.values()].map(r=>({data:r.data}))};
    if(/SELECT id FROM milestones$/i.test(sql)) return {results:[...milestones.keys()].map(id=>({id}))};
    if(/SELECT data FROM deleted$/i.test(sql)) return {results:[...deleted.values()].map(r=>({data:r.data}))};
    if(/SELECT id FROM risks UNION SELECT id FROM deleted/i.test(sql)) return {results:[...risks.keys(),...deleted.keys()].map(id=>({id}))};
    if(/SELECT ts, LENGTH\(data\) AS bytes FROM snapshots/i.test(sql))
      return {results:[...snapshots.values()].sort((a,b)=>a.ts<b.ts?1:-1).map(s=>({ts:s.ts, bytes:s.data.length}))};
    return {results:[]};
  }
  const api = {
    exec: async()=>({}),
    prepare(sql){ return { bind:(...args)=>({ first:async()=>first(sql,args), all:async()=>all(sql), run:async()=>run(sql,args), _sql:sql,_args:args }),
                          first:async()=>first(sql,[]), all:async()=>all(sql), run:async()=>run(sql,[]) }; },
    batch: async(stmts)=>{ for(const s of stmts) await s.run(); return []; }
  };
  return api;
}

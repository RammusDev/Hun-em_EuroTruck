import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import ts from 'typescript';import {Miniflare} from 'miniflare';
import {settingsView,settingText,hashText} from '../lib/maintenance.mjs';
async function bounded(work){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('request blocked behind canceled work or cleanup')),5000);})]);}finally{clearTimeout(timer);}}
test('real D1/R2 transaction: version restore, competing saves, failed snapshot and pure GET',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],r2Buckets:['BUCKET'],host:'127.0.0.1',port:0});
 try{
  const DB=await mf.getD1Database('DB'),BUCKET=await mf.getR2Bucket('BUCKET');await DB.prepare('CREATE TABLE hunem_runtime(id TEXT PRIMARY KEY,value TEXT,revision INTEGER,updated_at INTEGER,lease TEXT,lease_until INTEGER)').run();
  const now=Date.now(),p={files:{},eventArchitecture:true,world:{publicationWorldId:'isolated',now,realAt:now,diaries:[{day:'2026-10-26',zh:'unchanged'}]},eventPlan:{version:8,until:now+3600000,events:[{id:'same-event',dueAt:now+3600000}],steps:[]}};
  await BUCKET.put('snapshots/import-test.json',JSON.stringify(p));await DB.prepare('INSERT INTO hunem_runtime VALUES(?,?,?,?,NULL,NULL)').bind('world',JSON.stringify({key:'snapshots/import-test.json'}),0,now).run();
  const background=[];globalThis.__maintenanceStorage={DB,BUCKET,background};
  let code=await fs.readFile(new URL('../lib/runtime.ts',import.meta.url),'utf8');code=code.replace("import {env,waitUntil} from 'cloudflare:workers';",'const env=globalThis.__maintenanceStorage,waitUntil=task=>env.background.push(task);').replace("import bundledFiles from '../bridge/static-files.json';","import bundledFiles from '../bridge/static-files.json' with {type:'json'};");
  for(const name of ['./core.mjs','../bridge/advance.mjs','../bridge/static-files.json','../bridge/browser-state.mjs','../bridge/runtime-settings.mjs','../bridge/event-runtime.mjs','../bridge/event-trace.mjs','../bridge/snapshot-cache.mjs'])code=code.replace(`'${name}'`,JSON.stringify(new URL(name,new URL('../lib/runtime.ts',import.meta.url)).href));
  const runtime=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
  globalThis.__maintenanceStorage.runtime=runtime;
  let route=await fs.readFile(new URL('../app/api/maintenance/route.ts',import.meta.url),'utf8');route=route.replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__maintenanceStorage;').replace("import {worldActor} from '../../../lib/world-auth';",'const worldActor=async()=>({role:"user",owner:true,adminFresh:true});').replace("import {committed,transaction,engine,stateView} from '../../../lib/runtime';",'const {committed,transaction,engine,stateView}=globalThis.__maintenanceStorage.runtime;').replace("'../../../lib/maintenance.mjs'",JSON.stringify(new URL('../lib/maintenance.mjs',import.meta.url).href)).replace("import {readMonitor} from '../../../lib/monitor-store.mjs';",'const readMonitor=async()=>({});');
  const api=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
  const post=body=>api.POST(new Request('https://isolated.test/api/maintenance',{method:'POST',headers:{origin:'https://isolated.test','content-type':'application/json'},body:JSON.stringify(body)}));
  const row=()=>DB.prepare("SELECT * FROM hunem_runtime WHERE id='world'").first();const initial=await row();assert.equal((await api.GET(new Request('https://isolated.test/api/maintenance'))).status,200);assert.deepEqual(await row(),initial);
  const original=settingText(p,'travel'),value=JSON.parse(original);value.touring.visitMinutes=85;const body={op:'save',kind:'travel',expectedHash:hashText(original),text:JSON.stringify(value),reason:'隔離測試調整'};
  const race=await Promise.all([post(body),post(body)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);const after=await runtime.committed();assert.equal(after.maintenance.history.length,1);assert.deepEqual(after.world,p.world);assert.deepEqual(after.eventPlan,p.eventPlan);assert.ok(await BUCKET.get('maintenance/settings/travel/'+hashText(original)+'.txt'));
  const saved=after.maintenance.current.travel;assert.equal(settingsView(after).resources.find(r=>r.kind==='travel').applied,null);
  await runtime.transaction(async()=>({loaded:true}),false,true);const loaded=await runtime.committed();assert.equal(settingsView(loaded).resources.find(r=>r.kind==='travel').applied.hash,saved.hash);assert.deepEqual(loaded.eventPlan,p.eventPlan);
  assert.equal((await post({op:'restore',kind:'travel',hash:saved.beforeHash,expectedHash:saved.hash,reason:'回復原設定'})).status,200);const restored=await runtime.committed();assert.equal(restored.maintenance.history.length,2);assert.equal(JSON.parse(settingText(restored,'travel')).touring.visitMinutes,60);assert.deepEqual(restored.world,p.world);assert.deepEqual(restored.eventPlan,p.eventPlan);
  const put=BUCKET.put.bind(BUCKET);globalThis.__maintenanceStorage.BUCKET={get:BUCKET.get.bind(BUCKET),delete:BUCKET.delete.bind(BUCKET),list:BUCKET.list.bind(BUCKET),put:(key,...args)=>key.startsWith('snapshots/')?Promise.reject(Error('snapshot failure')):put(key,...args)};
  const beforeFail=await row();assert.equal((await post({...body,expectedHash:hashText(settingText(restored,'travel'))})).status,400);assert.equal((await row()).revision,beforeFail.revision);assert.equal((await row()).lease,null);assert.deepEqual((await runtime.committed()).maintenance,restored.maintenance);
  // A lost response must not wait on obsolete-object cleanup, and the next
  // transaction must still acquire D1 and commit in the same module instance.
  globalThis.__maintenanceStorage.BUCKET=BUCKET;
  let unblockDelete;const stalledDelete=new Promise(resolve=>{unblockDelete=resolve;});
  globalThis.__maintenanceStorage.BUCKET={get:BUCKET.get.bind(BUCKET),put:BUCKET.put.bind(BUCKET),list:BUCKET.list.bind(BUCKET),delete:async()=>stalledDelete};
  const beforeCleanup=await row();
  try{
   assert.deepEqual(await bounded(runtime.transaction(async p=>{p.world.marker='first';return {saved:true};},false,true)),{saved:true});
   assert.equal((await row()).lease,null);
   assert.deepEqual(await bounded(runtime.transaction(async p=>{p.world.marker='second';return {saved:true};},false,true)),{saved:true});
   assert.equal((await row()).revision,beforeCleanup.revision+2);assert.equal((await runtime.committed()).world.marker,'second');
  }finally{unblockDelete();await Promise.allSettled(background);}

  // Model an abandoned request stalled before hydration. Expiring its D1 lease
  // lets a new request proceed; resuming the old read must fail before mutation.
  let resumeRead,startedRead;const reading=new Promise(resolve=>{startedRead=resolve;});let blockOnce=true;
  globalThis.__maintenanceStorage.BUCKET={get:async key=>{if(blockOnce){blockOnce=false;const body=await BUCKET.get(key);startedRead();await new Promise(resolve=>{resumeRead=resolve;});return body;}return BUCKET.get(key);},put:BUCKET.put.bind(BUCKET),list:BUCKET.list.bind(BUCKET),delete:BUCKET.delete.bind(BUCKET)};
  let abandonedRan=false;
  const abandoned=runtime.transaction(async()=>{abandonedRan=true;return {};},false,true).then(()=>null,error=>error);
  await reading;await DB.prepare('UPDATE hunem_runtime SET lease_until=? WHERE id=?').bind(Date.now()-1,'world').run();
  let deadline;try{
   const saved=await Promise.race([runtime.transaction(async p=>{p.world.marker='recovered';return {saved:true};},false,true),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('request was blocked behind abandoned promise')),3000);})]);
   assert.deepEqual(saved,{saved:true});
  }finally{clearTimeout(deadline);resumeRead();}
  assert.equal((await abandoned).status,409);assert.equal(abandonedRan,false);assert.equal((await runtime.committed()).world.marker,'recovered');
 }finally{await Promise.allSettled(globalThis.__maintenanceStorage?.background||[]);delete globalThis.__maintenanceStorage;await mf.dispose();}
});

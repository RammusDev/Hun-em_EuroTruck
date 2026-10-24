import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {authorizeWorld,publicReaderView} from '../lib/world-policy.mjs';
const reader={role:'user',reader:true},owner={role:'user',reader:true,owner:true,adminFresh:true},stale={...owner,adminFresh:false},service={role:'service',scopes:['sync','publication','reference']};
test('reader API cannot export/configure/publish/reset; stale owner reads only; service is scoped',()=>{
 assert.throws(()=>authorizeWorld(null,'GET','/api/state'),e=>e.status===401);assert.equal(authorizeWorld(reader,'GET','/api/state'),'reader');
 for(const path of ['/api/export','/api/config','/api/debug','/api/worker','/api/publication','/api/research','/api/object'])assert.throws(()=>authorizeWorld(reader,'GET',path));
 for(const actor of [reader,owner,service])assert.throws(()=>authorizeWorld(actor,'POST','/api/reset-world'));
 assert.equal(authorizeWorld(stale,'GET','/api/state'),'reader');assert.throws(()=>authorizeWorld(stale,'POST','/api/config'));
 assert.equal(authorizeWorld(service,'GET','/api/worker'),'service');assert.throws(()=>authorizeWorld(service,'GET','/api/export'));assert.throws(()=>authorizeWorld({role:'service',scopes:['sync']},'POST','/api/publication'));
});
test('reader view does not leak added runtime fields or nested publication secrets',()=>{
 const source={position:[1,2],diaries:[{zh:'公開文字',publication:{id:'published',token:'secret'}}],finance:{cash:3},adminToken:'secret',publication:{pending:'secret'},files:{secret:1},futureSecret:'secret',pendingJob:{to:'city',error:'internal'}};
 const view=publicReaderView(source);assert.deepEqual(view.position,[1,2]);assert.equal(view.diaries[0].zh,'公開文字');assert.equal(view.finance.cash,3);assert.ok(!JSON.stringify(view).includes('secret'));assert.equal(source.diaries[0].publication.token,'secret');
});
test('actual world HTTP route rejects before runtime access and preserves controlled reader sync',async()=>{
 let reads=0,writes=0;globalThis.__worldActor=null;
 globalThis.__worldRuntime={stateView:p=>p,committed:async()=>{reads++;return {position:[1,2],adminToken:'secret'};},transaction:async fn=>{writes++;return fn({position:[3,4],adminToken:'secret'});},Conflict:class extends Error{},engine:{},seed:()=>{throw Error('must not seed');}};
 let source=fs.readFileSync(new URL('../app/api/[...path]/route.ts',import.meta.url),'utf8');source=source.replace(/^import .*from '\.\.\/\.\.\/\.\.\/lib\/runtime';/m,'const {transaction,seed,stateView,putObject,research,engine,committed,Conflict,resetWorld,correctStart,updateDrinkPreferences}=globalThis.__worldRuntime;').replace("import {publication} from '../../../lib/publication';",'const publication=()=>({});').replace("import {worldActor} from '../../../lib/world-auth';",'const worldActor=async()=>globalThis.__worldActor;').replace("'../../../lib/world-policy.mjs'",JSON.stringify(new URL('../lib/world-policy.mjs',import.meta.url).href));
 source=source.replace("import {journalRecovery} from '../../../lib/journal-recovery.mjs';",'const journalRecovery=async()=>({maintenance:true});').replace("import {env} from 'cloudflare:workers';",'const env={};');
 source=source.replace("import {readMonitor,setMonitorEmail,runMonitor} from '../../../lib/monitor-store.mjs';",'const readMonitor=()=>{throw Error("unexpected monitor access");},setMonitorEmail=readMonitor,runMonitor=readMonitor;');
 source=source.replace("import {footprintRead,footprintQueue,saveFootprint} from '../../../lib/footprints';",'const footprintRead=async()=>({items:[]}),footprintQueue=()=>({}),saveFootprint=()=>{throw Error("unexpected footprint upload");};');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const route=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const get=path=>route.GET(new Request('https://test.site'+path));const post=(path,origin)=>route.POST(new Request('https://test.site'+path,{method:'POST',headers:{origin:origin||'https://test.site'},body:'{}'}));
 assert.equal((await get('/api/state')).status,401);assert.equal(reads+writes,0);
 globalThis.__worldActor=reader;assert.equal((await get('/api/export')).status,403);const committed=await get('/api/state?view=committed');assert.equal((await committed.json()).viewerRole,'reader');assert.equal(reads,1);assert.equal(writes,0);
 assert.equal((await get('/api/footprints')).status,200);assert.equal((await post('/api/footprints')).status,403);assert.equal(writes,0);
 const synced=await get('/api/state');const data=await synced.json();assert.equal(writes,0);assert.equal(reads,2);assert.ok(!('adminToken' in data));assert.equal((await post('/api/publication')).status,403);
 globalThis.__worldActor=owner;assert.equal((await post('/api/config','https://attacker.test')).status,403);assert.equal((await post('/api/reset-world')).status,403);
 globalThis.__worldActor=service;assert.equal((await get('/api/export')).status,403);assert.equal((await post('/api/object?key=archive/private.png')).status,403);
});

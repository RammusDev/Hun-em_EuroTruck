import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
test('actual maintenance route enforces recent owner + Origin, pure reads, bounded JSON and scoped versions',async()=>{
 const maintenance=await import('../lib/maintenance.mjs');globalThis.__maintenance={actor:null,p:{files:{},world:{}},reads:0,writes:0};const state=globalThis.__maintenance;
 let source=fs.readFileSync(new URL('../app/api/maintenance/route.ts',import.meta.url),'utf8');
 source=source.replace("import {env} from 'cloudflare:workers';",'const env={BUCKET:{get:async()=>null}};');
 source=source.replace("import {worldActor} from '../../../lib/world-auth';",'const worldActor=async()=>globalThis.__maintenance.actor;');
 source=source.replace("import {committed,transaction,engine,stateView} from '../../../lib/runtime';",'const state=globalThis.__maintenance,committed=async()=>{state.reads++;return state.p},transaction=async()=>{state.writes++;throw Error("unexpected write")},engine={},stateView=()=>({});');
 source=source.replace("'../../../lib/maintenance.mjs'",JSON.stringify(new URL('../lib/maintenance.mjs',import.meta.url).href));
 source=source.replace("import {readMonitor} from '../../../lib/monitor-store.mjs';",'const readMonitor=async()=>({});');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const route=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const get=(q='')=>route.GET(new Request('https://test.site/api/maintenance'+q));
 const post=(body,origin='https://test.site',type='application/json')=>route.POST(new Request('https://test.site/api/maintenance',{method:'POST',headers:{origin,'content-type':type},body:typeof body==='string'?body:JSON.stringify(body)}));
 assert.equal((await get()).status,401);for(const actor of [{role:'user',reader:true},{role:'user',owner:true,adminFresh:false},{role:'service',scopes:['publication','reference']}]){state.actor=actor;assert.equal((await get()).status,403);assert.equal((await post({op:'save'})).status,403);}assert.equal(state.reads+state.writes,0);
 state.actor={role:'user',owner:true,adminFresh:true};assert.equal((await get()).status,200);assert.equal(state.writes,0);assert.equal((await post({op:'save'},'https://evil.test')).status,403);
 const text=maintenance.settingText(state.p,'travel'),body={op:'preview',kind:'travel',text,expectedHash:maintenance.hashText(text)};assert.equal((await post(body)).status,200);assert.equal(state.writes,0);assert.equal((await post({...body,expectedHash:'stale'})).status,409);
 assert.equal((await post('x'.repeat(1200001))).status,413);assert.equal((await post('{}','https://test.site','text/plain')).status,415);assert.equal((await get('?op=version&kind=../world&hash=abc')).status,400);
 assert.equal((await get('?op=debug')).status,200);assert.equal(state.writes,0);
});

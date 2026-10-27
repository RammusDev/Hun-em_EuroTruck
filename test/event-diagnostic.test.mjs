import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
test('event diagnosis runs on an uncommitted copy, redacts secrets and cannot choose a future time',async()=>{
 const original={world:{now:10},eventPlan:{version:2}},before=JSON.stringify(original),calls=[];
 globalThis.__eventDiagnostic={env:{EXAMPLE_SECRET:'DO_NOT_EXPOSE_THIS'},engine:{},transaction:async(fn,advance,commit)=>{calls.push({advance,commit});return fn(structuredClone(original));},runEventClock:async(p,engine,options)=>{assert.ok(Math.abs(options.real-Date.now())<1000);p.world.now=999;throw Error('DO_NOT_EXPOSE_THIS: missing helper');}};
 let source=fs.readFileSync(new URL('../lib/event-diagnostic.ts',import.meta.url),'utf8');
 source=source.replace("import {env} from 'cloudflare:workers';",'const {env}=globalThis.__eventDiagnostic;').replace("import {transaction,engine} from './runtime';",'const {transaction,engine}=globalThis.__eventDiagnostic;').replace("import {runEventClock} from '../bridge/event-runtime.mjs';",'const {runEventClock}=globalThis.__eventDiagnostic;').replace("'./maintenance.mjs'",JSON.stringify(new URL('../lib/maintenance.mjs',import.meta.url).href));
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,api=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const r=await api.diagnoseEventClock();assert.equal(r.ok,false);assert.equal(r.worldModified,false);assert.ok(!JSON.stringify(r).includes('DO_NOT_EXPOSE_THIS'));assert.equal(JSON.stringify(original),before);assert.deepEqual(calls,[{advance:false,commit:false}]);delete globalThis.__eventDiagnostic;
});

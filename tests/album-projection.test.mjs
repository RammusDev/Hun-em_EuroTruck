import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import {albumFromWorld} from '../../lib/album.mjs';
test('album uses the displayed clock without advancing world or revealing future art',()=>{
 const source=fs.readFileSync('lib/runtime.ts','utf8'),start=source.indexOf('export function stateView('),end=source.indexOf('export async function putObject',start);
 const code=ts.transpileModule(source.slice(start,end).replace('export function','function'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const cities=[{id:'test',name:'Test',countryName:'Test'}],world={now:100,diaries:[{day:'2026-10-21',illustrations:[{id:'published',src:'/illustrations/published.png',cityId:'test',drawnAt:150},{id:'future',src:'/illustrations/future.png',cityId:'test',drawnAt:250}]}]};
 const p={world,eventArchitecture:true,eventPlan:{}},before=structuredClone(p),core={snapshot:s=>({now:s.now}),projectPlan:()=>({now:200}),publicTimeline:()=>({}),tourMigration:{id:'test'},cities,albumFromWorld};
 const context=vm.createContext({core,browserState:x=>x,env:{},Date});vm.runInContext(code,context);const view=context.stateView(p);
 assert.equal(view.now,200);assert.deepEqual(view.album.map(a=>a.id),['published']);assert.deepEqual(p,before);
});

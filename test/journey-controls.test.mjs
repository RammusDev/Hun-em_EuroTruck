import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {authorizeWorld} from '../lib/world-policy.mjs';

test('journey omits management HTML for readers and service actors; retains introduction',async()=>{
 const html=fs.readFileSync(new URL('../private/journey.html',import.meta.url),'utf8');
 const source=fs.readFileSync(new URL('../app/journey/route.ts',import.meta.url),'utf8')
  .replace("import {requireReader} from '../../lib/world-auth';",'const requireReader=async()=>globalThis.__controlsActor;')
  .replace("import html from '../../private/journey.html?raw';",`const html=${JSON.stringify(html)};`);
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {GET}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 try{
  for(const actor of [{role:'user',owner:false},{role:'service'},{role:'user',owner:true}]){
   globalThis.__controlsActor=actor;
   const r=await GET(new Request('https://world.test/journey')),page=await r.text();
   assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private,no-store/);
   for(const marker of ['class="debug-tools"','class="dev-controls"','id="speed"','id="download-debug"'])assert.equal(page.includes(marker),!!actor.owner);
   assert.match(page,/每晚睡前/);assert.match(page,/<details class="about-journey-more">/);
   assert.equal((page.match(/<section class="about-journey"/g)||[]).length,1);
  }
 }finally{delete globalThis.__controlsActor;}
});

test('manual API calls cannot bypass reader restrictions or fresh owner requirement',()=>{
 for(const path of ['/api/debug','/api/retry-route','/api/config','/api/export']){
  for(const method of ['GET','POST']){
   for(const actor of [{role:'user',reader:true},{role:'user',owner:true,adminFresh:false},{role:'service',scopes:['sync','publication','reference']}])assert.throws(()=>authorizeWorld(actor,method,path));
   assert.equal(authorizeWorld({role:'user',owner:true,adminFresh:true},method,path),'owner');
  }
 }
});

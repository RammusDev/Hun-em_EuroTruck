import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

test('journey redirects denied readers and serves content only after authorization',async()=>{
 const source=fs.readFileSync(new URL('../app/journey/route.ts',import.meta.url),'utf8')
  .replace("import {requireReader} from '../../lib/world-auth';",'const requireReader=async()=>{if(globalThis.__journeyDenied)throw Object.assign(new Error("denied"),{status:globalThis.__journeyDenied});};')
  .replace("import html from '../../private/journey.html?raw';",'const html="<header></header><main>private journey</main>";');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {GET}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 try{
  for(const [status,target] of [[401,'/probe/login'],[403,'/account']]){
   globalThis.__journeyDenied=status;
   const r=await GET(new Request('https://world.test/journey'));
   assert.equal(r.status,302);assert.equal(r.headers.get('location'),target);
   assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(await r.text(),'');
  }
  globalThis.__journeyDenied=503;
  const failed=await GET(new Request('https://world.test/journey'));
  assert.equal(failed.status,503);assert.equal(failed.headers.get('location'),null);
  globalThis.__journeyDenied=0;
  const allowed=await GET(new Request('https://world.test/journey'));
  assert.equal(allowed.status,200);assert.match(await allowed.text(),/private journey/);
 }finally{delete globalThis.__journeyDenied;}
});

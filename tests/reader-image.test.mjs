import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import png from 'pngjs';
import jpeg from 'jpeg-js';
import {readerImageResponse} from '../bridge/reader-image.mjs';
import {createSnapshotTextCache} from '../bridge/snapshot-cache.mjs';
const image=()=>{const width=1024,data=Buffer.alloc(width*width*4);let r=123;for(let i=0;i<data.length;i+=4){r=(Math.imul(r,1664525)+1013904223)>>>0;data[i]=r&255;data[i+1]=(r>>>8)&255;data[i+2]=(r>>>16)&255;data[i+3]=255;}return png.PNG.sync.write({width,height:width,data});};
const object=(bytes,etag='fixture-1')=>({httpEtag:etag,body:new ReadableStream({start(c){c.enqueue(new Uint8Array(bytes));c.close();}}),arrayBuffer:async()=>bytes});
test('book requests return a small 512px JPEG; original pixels and URL remain unchanged',async()=>{
 const bytes=image(),key='generated/fixture/original.png';
 const res=await readerImageResponse(new Request('https://test/'+key+'?view=book'),object(bytes),key);
 const preview=Buffer.from(await res.arrayBuffer()),decoded=jpeg.decode(preview);
 assert.equal(res.headers.get('content-type'),'image/jpeg');assert.equal(decoded.width,512);assert.equal(decoded.height,512);
 assert.ok(preview.length<bytes.length/4);assert.ok(preview.length<=160*1024);
 const original=await readerImageResponse(new Request('https://test/'+key),object(bytes),key);
 assert.deepEqual(Buffer.from(await original.arrayBuffer()),bytes);assert.equal(original.headers.get('content-type'),'image/png');
 assert.notEqual(res.headers.get('etag'),original.headers.get('etag'));assert.equal(res.headers.get('cache-control'),'private, no-cache');assert.equal(res.headers.get('vary'),'Cookie');
});
test('revalidation and process cache avoid retransmitting or redecoding, version changes invalidate previews',async()=>{
 const bytes=image(),key='collections/meal/fixture/original.png',req=new Request('https://test/'+key+'?view=book');
 const first=await readerImageResponse(req,object(bytes,'v1'),key),tag=first.headers.get('etag');
 const cached=object(bytes,'v1');cached.arrayBuffer=()=>{throw Error('must reuse decoded preview');};
 const next=await readerImageResponse(req,cached,key);assert.deepEqual(Buffer.from(await next.arrayBuffer()),Buffer.from(await first.arrayBuffer()));
 const untouched=object(bytes,'v1');untouched.arrayBuffer=()=>{throw Error('304 must not decode');};
 const same=await readerImageResponse(new Request(req.url,{headers:{'If-None-Match':'W/'+tag}}),untouched,key);assert.equal(same.status,304);assert.equal(await same.text(),'');
 const changed=await readerImageResponse(new Request(req.url,{headers:{'If-None-Match':tag}}),object(bytes,'v2'),key);assert.equal(changed.status,200);assert.notEqual(changed.headers.get('etag'),tag);
});
test('all image routes recheck reader and public visibility before serving cached previews or 304',async()=>{
 const bytes=png.PNG.sync.write({width:128,height:128,data:Buffer.alloc(128*128*4,255)});
 for(const route of ['footprints','collections','generated','illustrations']){
  const key=route==='illustrations'?'illustrations/fixture.png':route+'/fixture/original.png';
  const state={allowed:true,visible:true,reads:0};globalThis.__readerImageTest={
   requireReader:async()=>{if(!state.allowed)throw Object.assign(Error('denied'),{status:401});},
   get:async()=>{state.reads++;return state.visible?object(bytes,'route-'+route):null;},
   committed:async()=>({world:{diaries:state.visible?[{illustrations:[{src:'/'+key}]}]:[]}})
  };
  let source=await fs.readFile(new URL('../app/'+route+'/[...path]/route.ts',import.meta.url),'utf8');
  source=source.replace(/^import .*from '\.\.\/\.\.\/\.\.\/lib\/world-auth';/m,'const {requireReader}=globalThis.__readerImageTest;')
   .replace(/^import .*from '\.\.\/\.\.\/\.\.\/lib\/(runtime|collections|footprints)';/m,'const {get:getObject,get:footprintObject,get:collectionObject,committed}=globalThis.__readerImageTest;')
   .replace("'../../../bridge/reader-image.mjs'",JSON.stringify(new URL('../bridge/reader-image.mjs',import.meta.url).href));
  const api=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
  const url='https://test/'+key+'?view=book',res=await api.GET(new Request(url));assert.equal(res.status,200);
  const tag=res.headers.get('etag');await res.arrayBuffer();const before=state.reads;state.allowed=false;
  const denied=await api.GET(new Request(url,{headers:{'If-None-Match':tag}}));assert.equal(denied.status,401);assert.equal(state.reads,before);assert.equal(denied.headers.get('cache-control'),'no-store');
  if(route!=='illustrations'){state.allowed=true;state.visible=false;assert.equal((await api.GET(new Request(url,{headers:{'If-None-Match':tag}}))).status,404);}
 }
 delete globalThis.__readerImageTest;
});
test('snapshot text cache reuses completed revisions but never shares mutable worlds or in-flight work',async()=>{
 const read=createSnapshotTextCache();let calls=0;
 const load=async()=>{calls++;return '{"world":{"now":1}}';};
 const [a,b]=await Promise.all([read('revision1',load),read('revision1',load)]);assert.equal(calls,2);await read('revision1',load);assert.equal(calls,2);
 const mutated=JSON.parse(a);mutated.world.now=999;assert.equal(JSON.parse(b).world.now,1);
 assert.equal(JSON.parse(await read('revision2',async()=>'{"world":{"now":2}}')).world.now,2);
 let failures=0;await assert.rejects(()=>read('retry',()=>{failures++;throw Error('storage');}),/storage/);
 await read('retry',()=>{failures++;return '{}';});assert.equal(failures,2);
 const small=createSnapshotTextCache({maxChars:1});calls=0;await small('large',load);await small('large',load);assert.equal(calls,2);
});
test('a canceled snapshot load cannot block the next request for the same revision',async()=>{
 const read=createSnapshotTextCache();let finish;
 const abandoned=read('revision',()=>new Promise(resolve=>{finish=resolve;}));
 assert.equal(await read('revision',async()=>'{}'),'{}');
 finish('{}');await abandoned;
});

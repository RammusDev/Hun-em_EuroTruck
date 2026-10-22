import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import jpeg from 'jpeg-js';

test('actual Worker compresses recent PNGs and reuses R2 previews',async()=>{
 const built=await build({stdin:{contents:`import {cachedReferencePreview} from './bridge/reference-preview.mjs'; export default {async fetch(req,env){const obj=await env.BUCKET.get(new URL(req.url).pathname.slice(1));const p=await cachedReferencePreview(new Uint8Array(await obj.arrayBuffer()),{get:k=>env.BUCKET.get(k),put:(...args)=>env.BUCKET.put(...args)});return new Response(p.bytes,{headers:{'Content-Type':p.mimeType,'X-Preview-Cache':String(p.cacheHit)}});}};`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',banner:{js:"import {createRequire} from 'node:module'; const require=createRequire('/worker.js');"}});
 const mf=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],r2Buckets:['BUCKET'],host:'127.0.0.1',port:0});
 try{const bucket=await mf.getR2Bucket('BUCKET');for(const day of ['19','20']){
  const source=readFileSync(`../data/album-variety-20261021/2026-10-${day}-square.png`);await bucket.put(day,source);
  const a=await mf.dispatchFetch('http://local/'+day);assert.equal(a.status,200,a.status===200?'':await a.clone().text());assert.equal(a.headers.get('X-Preview-Cache'),'false');
  const bytes=Buffer.from(await a.arrayBuffer());assert.ok(bytes.length<160*1024);assert.equal(jpeg.decode(bytes).width,512);
  const b=await mf.dispatchFetch('http://local/'+day);assert.equal(b.headers.get('X-Preview-Cache'),'true');assert.deepEqual(Buffer.from(await b.arrayBuffer()),bytes);
 }}finally{await mf.dispose();}
});

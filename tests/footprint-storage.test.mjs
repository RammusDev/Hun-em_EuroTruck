import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
import png from 'pngjs';
import jpeg from 'jpeg-js';
import {footprintInventory} from '../bridge/footprints.mjs';
test('isolated D1/R2: pure reads, reviewed immutable original, 128px thumbnail, authorization visibility and idempotency',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'footprint-test'},r2Buckets:{BUCKET:'footprint-test'},host:'127.0.0.1',port:0});
 try{
  const DB=await mf.getD1Database('DB'),BUCKET=await mf.getR2Bucket('BUCKET');await DB.prepare('CREATE TABLE hunem_runtime(id TEXT PRIMARY KEY,value TEXT,revision INTEGER,updated_at INTEGER)').run();
  const p={world:{publicationWorldId:'isolated',now:Date.now(),events:[{type:'visit',time:1,place:{topicId:'test',name:'Isolated landmark',p:[9,54]}}]}};
  const before=JSON.stringify(p);globalThis.__footprintsTest={DB,BUCKET,p};
  let code=await fs.readFile(new URL('../lib/footprints.ts',import.meta.url),'utf8');
  code=code.replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__footprintsTest;').replace("import {committed} from './runtime';",'const committed=async()=>globalThis.__footprintsTest.p;');
  for(const file of ['footprints.mjs','mcp-file.mjs','reference-preview.mjs'])code=code.replace(`'../bridge/${file}'`,JSON.stringify(new URL('../bridge/'+file,import.meta.url).href));
  const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const api=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  const row=footprintInventory(p)[0];await api.footprintRead(new URL('https://isolated.test/api/footprints'));
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM hunem_runtime').first()).n,0);assert.equal((await BUCKET.list()).objects.length,0);
  const image=png.PNG.sync.write({width:256,height:256,data:Buffer.alloc(256*256*4,255)}),review={tool:'image_gen.imagegen',actuallyCalled:true,landmarkRecognizable:true,originalGeneratedPath:'isolated-test-fixture.png'};
  await assert.rejects(()=>api.saveFootprint(row.id,image,{}),/REVIEW_REQUIRED/);
  await assert.rejects(()=>api.saveFootprint('0'.repeat(32),image,review),/VISIT_REQUIRED/);
  const saved=await api.saveFootprint(row.id,image,review);assert.equal(saved.worldModified,false);
  assert.deepEqual(Buffer.from(await (await api.footprintObject(saved.src.slice(1))).arrayBuffer()),image);
  const thumb=await api.footprintObject(saved.thumbnail.slice(1)),decoded=jpeg.decode(Buffer.from(await thumb.arrayBuffer()));assert.equal(decoded.width,128);assert.equal(decoded.height,128);
  assert.equal((await api.saveFootprint(row.id,image,review)).reused,true);
  const other=png.PNG.sync.write({width:256,height:256,data:Buffer.alloc(256*256*4,120)});await assert.rejects(()=>api.saveFootprint(row.id,other,review),/ALREADY_DRAWN/);
  assert.equal(await api.footprintObject('footprints/'+row.id+'/'+'0'.repeat(64)+'.png'),null);
  assert.ok(await BUCKET.get('backups/manual-before-footprints-20261024.json'));assert.equal(JSON.stringify(p),before);
 }finally{delete globalThis.__footprintsTest;await mf.dispose();}
});

import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import ts from 'typescript';import {Miniflare} from 'miniflare';import png from 'pngjs';import jpeg from 'jpeg-js';
import {createHash} from 'node:crypto';import {sodaReferenceCatalog} from '../bridge/soda-reference.mjs';
test('isolated D1/R2 collections: pure reads, scoped claim, reviewed alpha PNG, original/thumbnail persistence, byte idempotency and immutable repeats',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'collection-test'},r2Buckets:{BUCKET:'collection-test'},host:'127.0.0.1',port:0});
 try{
  const DB=await mf.getD1Database('DB'),BUCKET=await mf.getR2Bucket('BUCKET');await DB.prepare('CREATE TABLE hunem_runtime(id TEXT PRIMARY KEY,value TEXT,revision INTEGER,updated_at INTEGER,lease TEXT,lease_until INTEGER)').run();
  const p={world:{publicationWorldId:'test',now:Date.now(),events:[{type:'soda_finished',purchaseId:'purchase',time:2,soda:{id:'orange'}},{type:'expense',category:'soda',id:'purchase',time:1,soda:{id:'orange',name:'Orange soda'}},{type:'meal_finished',mealId:'m',time:2,food:{name:'普通套餐',localDish:false}}]}};const before=JSON.stringify(p);globalThis.__collectionTest={DB,BUCKET,p};
  let code=await fs.readFile(new URL('../lib/collections.ts',import.meta.url),'utf8');code=code.replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__collectionTest;').replace("import {committed} from './runtime';",'const committed=async()=>globalThis.__collectionTest.p;');
  for(const file of ['sketch-progress.mjs','collection-image.mjs','collections.mjs','mcp-file.mjs','reference-preview.mjs','collection-image.mjs','collection-reference.mjs','meal-reference-cache.mjs','soda-reference.mjs','collection-artifacts.mjs','sketch-lifecycle.mjs'])code=code.replace(`'../bridge/${file}'`,JSON.stringify(new URL('../bridge/'+file,import.meta.url).href));
  const api=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
  const read=await api.collectionRead(new URL('https://test/api/collections?kind=soda'));assert.equal(read.totalOccurrences,1);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM hunem_runtime').first()).n,0);assert.equal((await BUCKET.list()).objects.length,0);
  const id=read.items[0].id;assert.deepEqual(await api.collectionRows('meal'),[]);const summary=await api.collectionRead(new URL('https://test/api/collections?mode=summary'));assert.deepEqual(summary.meal,{total:0,totalOccurrences:0});await assert.rejects(()=>api.claimCollection('meal','0'.repeat(32)),/SPECIALTY_OR_PURCHASE/);await assert.rejects(()=>api.claimCollection('soda','0'.repeat(32)),/SPECIALTY_OR_PURCHASE/);
  const c=await api.claimCollection('soda',id);assert.equal(c.action,'generate');assert.equal((await api.claimCollection('soda',id)).action,'busy');
  const opaque=png.PNG.sync.write({width:128,height:128,data:Buffer.alloc(128*128*4,255)}),rgba=Buffer.alloc(128*128*4,255);rgba[3]=0;const bytes=png.PNG.sync.write({width:128,height:128,data:rgba}),review={tool:'image_gen.imagegen',actuallyCalled:true,subjectRecognizable:true,originalGeneratedPath:'isolated-fixture-only'};
  await assert.rejects(()=>api.saveCollection('soda',id,'wrong',bytes,review),/CLAIM_REQUIRED/);await assert.rejects(()=>api.saveCollection('soda',id,c.lease,bytes,{}),/REVIEW_REQUIRED/);await assert.rejects(()=>api.saveCollection('soda',id,c.lease,opaque,review),/TRANSPARENT_SUBJECT/);
  const row=read.items[0];await DB.prepare('INSERT INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind('sketch-selection:soda:'+id,JSON.stringify({...row,worldId:'test',selectedAt:Date.now(),selectionToken:'purchase'}),Date.now()).run();
  globalThis.__collectionTest.BUCKET={get:k=>k.endsWith('.png')?null:BUCKET.get(k),put:(...args)=>BUCKET.put(...args)};
  await assert.rejects(()=>api.saveCollection('soda',id,c.lease,bytes,review),/ARTIFACT_READBACK_REQUIRED/);
  assert.equal(await DB.prepare('SELECT value FROM hunem_runtime WHERE id=?').bind('collection:soda:'+id).first(),null,'failed artifact readback cannot mark drawing complete');
  globalThis.__collectionTest.BUCKET=BUCKET;
  const saved=await api.saveCollection('soda',id,c.lease,bytes,review);assert.equal(saved.worldModified,false);assert.equal((await api.claimCollection('soda',id)).action,'already-drawn');assert.equal((await api.saveCollection('soda',id,c.lease,bytes,review)).reused,true);await assert.rejects(()=>api.saveCollection('soda',id,c.lease,opaque,review),/ALREADY_DRAWN/);
  assert.deepEqual(Buffer.from(await(await api.collectionObject(saved.src.slice(1))).arrayBuffer()),bytes);const thumbnail=jpeg.decode(Buffer.from(await(await api.collectionObject(saved.thumbnail.slice(1))).arrayBuffer()));assert.equal(thumbnail.width,128);assert.equal(await api.collectionObject('collections/soda/'+id+'/'+'0'.repeat(64)+'.png'),null);assert.equal(JSON.stringify(p),before);
  p.world.events.push({type:'expense',category:'soda',id:'new-purchase',time:3,soda:{id:'sanpellegrino-aranciata',name:'Sanpellegrino Aranciata Naturali'}});
  const orange=(await api.collectionRows('soda',undefined,true)).find(r=>r.identity==='sanpellegrino-aranciata'),product=sodaReferenceCatalog.products.find(p=>p.id==='sanpellegrino-aranciata'),oldHash=product.sha256;
  try{
   await assert.rejects(()=>api.cacheSodaReference('0'.repeat(32),bytes),/RECORDED_SPECIALTY_OR_PURCHASE/);
   await assert.rejects(()=>api.cacheSodaReference(orange.id,bytes),/REVIEWED_HASH_REQUIRED/);
   product.sha256=createHash('sha256').update(bytes).digest('hex');const beforeReference=JSON.stringify(p);
   const prepared=await api.cacheSodaReference(orange.id,bytes);assert.equal(prepared.worldModified,false);assert.deepEqual(prepared.errors,[]);assert.equal(prepared.photos[0].preparationMethod,'owner-reviewed-original');
   const content=await api.collectionQueueContent('soda',orange.id);assert.equal(content.content[1].type,'image');assert.equal(JSON.stringify(p),beforeReference);
   const claim=await api.claimCollection('soda',orange.id),saved=await api.saveCollection('soda',orange.id,claim.lease,bytes,review);
   assert.equal(saved.worldModified,false);assert.equal(await BUCKET.get('reference-photos/soda-v1/'+orange.id+'.json'),null);assert.ok(await BUCKET.get('reference-audit/soda/'+orange.id+'.json'));
  }finally{product.sha256=oldHash;p.world.events.pop();}
 }finally{delete globalThis.__collectionTest;await mf.dispose();}
});

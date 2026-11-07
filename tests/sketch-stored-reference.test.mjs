import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {mealReferenceCache} from '../bridge/meal-reference-cache.mjs';
import {queueSketchWork,readSketchReference,sketchClaimKey} from '../bridge/sketch-work.mjs';
import {collectionEventService} from '../bridge/collection-events.mjs';
import {selectedSketches} from '../bridge/sketch-lifecycle.mjs';
const jpeg=Buffer.from([255,216,255,224,0,1]);
test('all three kinds persist reference bytes before queueing, reuse them without upstream fetch, native read is pure',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'stored-ref'},r2Buckets:{BUCKET:'stored-ref'},host:'127.0.0.1',port:0});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
  await db.prepare('CREATE TABLE hunem_runtime(id TEXT PRIMARY KEY,value TEXT,revision INTEGER,updated_at INTEGER,lease TEXT,lease_until INTEGER)').run();
  for(const kind of ['meal','soda','footprint']){
   const row={id:'a'.repeat(32),name:'Exact selected subject',kind};
   const missing=await queueSketchWork({db,bucket,kind,row,prepareReference:async()=>({photos:[],errors:['REFERENCE_HTTP_403']})});
   assert.equal(missing.action,'reference_pending');assert.equal(await db.prepare('SELECT id FROM hunem_runtime WHERE id=?').bind(sketchClaimKey(kind,row.id)).first(),null);
   let downloads=0;
   const cache=mealReferenceCache({bucket,kind,lookup:async()=>{downloads++;return {photos:[{bytes:jpeg,mimeType:'image/jpeg',sourcePage:'https://example.test/subject'}],errors:[]};}});
   await cache.prepare(row);await cache.prepare(row);assert.equal(downloads,1);
   const queued=await queueSketchWork({db,bucket,kind,row});assert.equal(queued.action,'generate');assert.equal(queued.referenceRead.tool,'hunem_sketch_reference');assert.ok(!JSON.stringify(queued).includes(jpeg.toString('base64')));
   const before=JSON.stringify((await db.prepare('SELECT * FROM hunem_runtime ORDER BY id').all()).results);
   const native=await readSketchReference({bucket,kind,id:row.id});assert.equal(JSON.parse(native.content[0].text).action,'reference_ready');assert.equal(native.content[1].data,jpeg.toString('base64'));
   assert.equal(JSON.stringify((await db.prepare('SELECT * FROM hunem_runtime ORDER BY id').all()).results),before);
   await bucket.delete(`reference-photos/${kind==='meal'?'meal-v2':kind+'-v1'}/${row.id}.json`);
   assert.equal(JSON.parse((await readSketchReference({bucket,kind,id:row.id})).content[0].text).action,'reference_pending');
  }
 }finally{await mf.dispose();}
});
test('failed reference preparation sends no webhook, retries with backoff, then delivers exactly once after stored photo is ready',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'ref-gate'},r2Buckets:{BUCKET:'ref-gate'},host:'127.0.0.1',port:0});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');await db.prepare('CREATE TABLE hunem_runtime(id TEXT PRIMARY KEY,value TEXT,revision INTEGER,updated_at INTEGER,lease TEXT,lease_until INTEGER)').run();
  let now=1000,ready=false,preparations=0,sends=0;
  const p={world:{publicationWorldId:'w',now:1000,events:[]},eventPlan:{createdAt:1000,steps:[{patch:[[['events'],1,[{type:'expense',category:'meal',id:'m',time:2000,food:{name:'Risotto',localDish:true,cityId:'it-palermo',source:'https://example.test'}}]]]}]}};
  const service=collectionEventService({db,bucket,kind:'meal',now:()=>now,prepareReference:async({row})=>{preparations++;if(!ready)return {photos:[],errors:['REFERENCE_HTTP_403']};const c=mealReferenceCache({bucket,lookup:async()=>({photos:[{bytes:jpeg,mimeType:'image/jpeg'}],errors:[]})});await c.prepare(row);return c.read(row.id);},fetcher:async(_,o)=>{const b=JSON.parse(o.body);if(b.type==='verification')return Response.json({challenge:b.challenge});sends++;return new Response(null,{status:200});}});
  await service.rpc('events/subscribe',{name:'hunem.meal_completed',arguments:{},delivery:{mode:'webhook',url:'https://chatgpt.com/mcp-events/gate',secret:'whsec_'+Buffer.alloc(32,3).toString('base64')},ttlMs:86400000},'owner','w');
  await service.process(p);assert.equal(sends,0);assert.equal(preparations,1);assert.equal((await service.status(p)).completion.items[0].state,'reference_blocked');
  await service.process(p);assert.equal(preparations,1);
  ready=true;now+=5*60000+1;await service.process(p);assert.equal(sends,1);await service.process(p);assert.equal(sends,1);
  const id=selectedSketches(p,'meal')[0].id;assert.equal((await readSketchReference({bucket,kind:'meal',id})).content[1].data,jpeg.toString('base64'));
  // A permanently unavailable source has a finite server-side retry budget.
  const receipt=await db.prepare("SELECT id,value FROM hunem_runtime WHERE id LIKE 'collection-event:meal:%'").first();
  const failed={...JSON.parse(receipt.value),status:'pending',referenceAttempts:7,referencePending:true,nextAt:0};
  await db.prepare('DELETE FROM hunem_runtime WHERE id=?').bind(sketchClaimKey('meal',id)).run();
  await db.prepare('UPDATE hunem_runtime SET value=? WHERE id=?').bind(JSON.stringify(failed),receipt.id).run();
  ready=false;await service.process(p);assert.equal((await service.status(p)).stopped,1);const count=preparations;
  now+=86400000;await service.process(p);assert.equal(preparations,count);assert.equal(sends,1);
 }finally{await mf.dispose();}
});

import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {mealReferenceCache} from '../bridge/meal-reference-cache.mjs';
import {selectedSketches} from '../bridge/sketch-lifecycle.mjs';
const selectedMealReferences=p=>selectedSketches(p,'meal');
const id='a'.repeat(32),jpeg=Buffer.from([255,216,255,224,0,1]),png=Buffer.from([137,80,78,71,13,10,26,10,1]);
const digest=b=>createHash('sha256').update(b).digest('hex');
const key='reference-photos/meal-v2/'+id+'.json';
function fake(){const objects=new Map();return {objects,get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k).toString()),arrayBuffer:async()=>Buffer.from(objects.get(k))}:null,put:async(k,v)=>objects.set(k,Buffer.from(v)),delete:async k=>objects.delete(k),list:async({prefix})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})};}
const photo={bytes:jpeg,mimeType:'image/jpeg',sourcePage:'https://commons.wikimedia.org/wiki/File:Food.jpg',credit:'Author',license:'CC BY-SA'};
test('actual minute plan produces a stable selected dish ID before completion without network or world mutation',async()=>{
 const {initial,dateParts}=await import('../../lib/engine-v2.mjs'),{initEconomy}=await import('../../lib/economy.mjs'),{actualTopicAnchor}=await import('../../lib/local-topics.mjs'),{buildEventPlan}=await import('../../lib/event-timeline.mjs');
 const world=initial(Date.parse('2026-10-20T09:59Z'));world.location='bonn';world.homePolicySince=world.now;world.realAt=world.now;world.eventMode=true;world.workCycle={deliveredDay:'2026-10-19',resumeDay:'2026-10-22'};world.tourPlans={'2026-10-20':{kind:'hotel-rest'}};initEconomy(world,dateParts(world.now));
 const anchor=actualTopicAnchor(world);world.localTopicCache={[anchor.key]:{anchor,status:'ready',food:[{source:'https://en.wikivoyage.org/wiki/Test',dishes:[{id:'fixture',name:'Fixture soup',localDish:true,cityId:'bonn',source:'https://en.wikivoyage.org/wiki/Test'}]}],landmarks:[]}};
 const p={world,files:{},routes:{}},before=JSON.stringify(world);p.eventPlan=await buildEventPlan(p,{maxMinutes:35});const rows=selectedMealReferences(p);assert.equal(JSON.stringify(world),before);assert.ok(rows.length>0);assert.equal(rows[0].name,'Fixture soup');assert.ok(!world.events.some(e=>e.type==='meal_finished'));
});
test('selected meals come from chosen plan expenses, not all researched candidates or future completed facts',()=>{
 const food={name:'lampredotto',localDish:true,cityId:'it-firenze',source:'https://en.wikivoyage.org/wiki/Florence'};
 const event={type:'expense',category:'meal',id:'meal1',time:2000,food};
 const p={world:{now:1000,publicationWorldId:'world',events:[],localTopicCache:{dishes:['unselected']}},eventPlan:{steps:[{patch:[[['events'],1,[event]]]}]}};
 const before=JSON.stringify(p),rows=selectedMealReferences(p);assert.equal(rows.length,1);assert.equal(rows[0].name,'lampredotto');assert.equal(p.world.events.length,0);assert.equal(JSON.stringify(p),before);
 assert.equal(selectedMealReferences({...p,eventPlan:{steps:[]}}).length,0);
});
test('prepare once, draw cache only, retry keeps identical photo; deletion follows verified artifact readback',async()=>{
 const bucket=fake();let calls=0,time=1000;const cache=mealReferenceCache({bucket,now:()=>time,lookup:async()=>{calls++;return {photos:[photo],errors:[]};}});
 const row={id,name:'food'};await cache.prepare(row);await cache.prepare(row);assert.equal(calls,1);
 assert.equal((await cache.read(id)).photos[0].bytes.toString('hex'),jpeg.toString('hex'));assert.equal(calls,1);
 const image={src:'/art.png',thumbnail:'/thumb.jpg',sha256:digest(png)};
 await assert.rejects(cache.finish(id,image),/READBACK_REQUIRED/);assert.ok(bucket.objects.has(key));
 await bucket.put('art.png','corrupt');await bucket.put('thumb.jpg',jpeg);await assert.rejects(cache.finish(id,image),/READBACK_FAILED/);assert.ok(bucket.objects.has(key));
 await cache.sweep(new Map([[id,image]]));assert.ok(bucket.objects.has(key));
 await bucket.put('art.png',png);await cache.finish(id,image);assert.ok(!bucket.objects.has(key));assert.equal((await cache.read(id)).photos.length,0);assert.equal(calls,1);
 const audit=JSON.parse(bucket.objects.get('reference-audit/meal/'+id+'.json'));assert.equal(audit.deleteReason,'artwork-verified');assert.equal(audit.photos[0].sha256,digest(jpeg));assert.equal(audit.photos[0].data,undefined);assert.equal(audit.photos[0].license,'CC BY-SA');
});
test('download failure stays pending, retries only in preparation, expires without a new schedule',async()=>{
 const bucket=fake();let calls=0,time=1000;const cache=mealReferenceCache({bucket,now:()=>time,lookup:async()=>{calls++;return {photos:[],errors:['403']};}});
 await cache.prepare({id,name:'food'});assert.equal((await cache.read(id)).errors[0],'REFERENCE_PREPARATION_FAILED');await cache.prepare({id,name:'food'});assert.equal(calls,1);
 time+=5*60000;await cache.prepare({id,name:'food'});assert.equal(calls,2);time+=8*86400000;await cache.sweep();assert.ok(!bucket.objects.has(key));assert.equal(calls,2);
});
test('cached failure diagnostics retain bounded codes without upstream secrets or queue writes',async()=>{
 const bucket=fake();await bucket.put(key,JSON.stringify({at:1000,expiresAt:999999,status:'failed',photos:[],errors:['REFERENCE_HTTP_403','The operation was aborted due to timeout','secret=https://private.test/?token=hidden','REFERENCE_HTTP_403']}));
 const before=Buffer.from(bucket.objects.get(key));const r=await mealReferenceCache({bucket,now:()=>2000}).read(id);
 assert.deepEqual(r.errors,['REFERENCE_PREPARATION_FAILED','REFERENCE_HTTP_403','REFERENCE_TIMEOUT','REFERENCE_FETCH_FAILED']);
 assert.deepEqual(bucket.objects.get(key),before);assert.equal(r.preparedAt,1000);
});
test('new lookup version retries old failed caches once while keeping successful photos and current backoff',async()=>{
 const bucket=fake();let calls=0;const cache=mealReferenceCache({bucket,now:()=>2000,lookup:async()=>{calls++;return {photos:[],errors:['REFERENCE_HTTP_403']};}});
 await bucket.put(key,JSON.stringify({at:1000,expiresAt:999999,retryAt:99999,status:'failed',photos:[],errors:['REFERENCE_HTTP_403']}));
 await cache.prepare({id,name:'Arancini'});await cache.prepare({id,name:'Arancini'});assert.equal(calls,1);
 await bucket.put(key,JSON.stringify({at:1000,expiresAt:999999,retryAt:99999,status:'ready',photos:[{...photo,data:jpeg.toString('base64'),sha256:digest(jpeg)}]}));
 await cache.prepare({id,name:'Arancini'});assert.equal(calls,1);assert.equal((await cache.read(id)).photos.length,1);
});

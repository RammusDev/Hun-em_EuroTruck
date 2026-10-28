import test from 'node:test';import assert from 'node:assert/strict';import {Miniflare} from 'miniflare';
import {collectionEventService,collectionEventNames} from '../bridge/collection-events.mjs';
import {collectionInventory} from '../bridge/collections.mjs';
const secret='whsec_'+Buffer.alloc(32,7).toString('base64');
test('meal/soda isolated D1 subscriptions: historical watermark, real completion/purchase, independent callbacks, stable retries, image suppression and replay',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'collections-events'},r2Buckets:{BUCKET:'collections-events'},host:'127.0.0.1',port:0});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');await db.prepare('CREATE TABLE hunem_runtime(id TEXT PRIMARY KEY,value TEXT,revision INTEGER,updated_at INTEGER,lease TEXT,lease_until INTEGER)').run();
  let now=1792800000000,fail=false;const sent=[];
  const fetcher=async(url,o)=>{const body=JSON.parse(o.body);if(body.type==='verification')return Response.json({challenge:body.challenge});sent.push({url,body});return new Response(null,{status:fail?503:202});};
  const service=kind=>collectionEventService({db,bucket,kind,now:()=>now,fetcher}),args=kind=>({name:collectionEventNames[kind],delivery:{mode:'webhook',url:'https://chatgpt.com/mcp-events/'+kind,secret},arguments:{},ttlMs:3600000});
  await assert.rejects(()=>service('soda').rpc('events/subscribe',args('soda'),'','w'),/OWNER_REQUIRED/);
  for(const kind of ['meal','soda'])await service(kind).rpc('events/subscribe',args(kind),'owner','w');
  const meal=(id,time,local=true)=>({type:'meal_finished',mealId:id,time,day:'day',meal:'lunch',food:{name:id,localDish:local,source:'https://example.org/food',cityId:'a'}}),soda=(id,time)=>({type:'expense',category:'soda',id,time,day:'day',soda:{id,name:id}});
  const p={world:{publicationWorldId:'w',now,events:[meal('historical',now-1),soda('historical-soda',now-1)]}};await service('meal').process(p);await service('soda').process(p);assert.equal(sent.length,0,'subscription does not automatically backfill');
  now+=1000;p.world.now=now;p.world.events.push({type:'expense',category:'meal',id:'local',time:now,food:{name:'local',localDish:true,cityId:'a',source:'https://example.org/food'}},meal('local',now),meal('If you',now),meal('ordinary',now,false),soda('bottle',now),{type:'soda_finished',time:now,soda:{id:'not-purchased'}},meal('future',now+1000));const before=JSON.stringify(p);
  fail=true;await Promise.all([service('meal').process(p),service('soda').process(p)]);assert.equal(sent.length,2);assert.ok(!sent.some(s=>s.body.data.name==='If you'));assert.equal((await service('meal').status()).retrying,1);assert.equal((await service('soda').status()).retrying,1);
  await service('soda').process(p);assert.equal(sent.length,2);now+=3*60000;fail=false;await Promise.all([service('soda').process(p),service('soda').process(p)]);await service('meal').process(p);assert.equal(sent.length,4);assert.equal(sent[0].body.eventId,sent.find((s,i)=>i>1&&s.body.name===sent[0].body.name).body.eventId);assert.equal(JSON.stringify(p),before);
  const delivered=sent.find(s=>s.body.name===collectionEventNames.soda);assert.equal(delivered.body.data.kind,'soda');assert.equal(delivered.body.data.recordedAt,p.world.now);assert.equal(delivered.url,'https://chatgpt.com/mcp-events/soda');
  const id=delivered.body.data.collectionId,requestId='11111111-1111-4111-8111-111111111111';await Promise.all([service('soda').replay(p,id,requestId),service('soda').replay(p,id,requestId)]);assert.equal(sent.length,5);assert.notEqual(sent[4].body.eventId,delivered.body.eventId);assert.deepEqual(sent[4].body.data,delivered.body.data);
  await service('soda').replay(p,id,requestId);assert.equal(sent.length,5);
  await db.prepare('INSERT INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind('collection:soda:'+id,'{}',now).run();assert.equal((await service('soda').replay(p,id,requestId)).action,'already-drawn');
  const status=JSON.stringify(await service('soda').status());assert.ok(!status.includes(secret)&&!status.includes('https://chatgpt.com'));
  now+=10*60000;await service('soda').rpc('events/subscribe',args('soda'),'owner','w');assert.equal((await service('soda').status()).activeSubscriptions,1);await service('soda').process(p);assert.equal(sent.length,5,'renewal keeps historical watermark and receipt');
  await service('meal').rpc('events/unsubscribe',args('meal'),'owner','w');assert.equal((await service('meal').status()).activeSubscriptions,0);assert.equal((await service('soda').status()).activeSubscriptions,1);
  assert.equal(collectionInventory(p,'soda',p.world.now).length,2);
 }finally{await mf.dispose();}
});

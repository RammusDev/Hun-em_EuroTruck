import test from 'node:test';import assert from 'node:assert/strict';import {Miniflare} from 'miniflare';
import {collectionEventService} from '../bridge/collection-events.mjs';import {collectionInventory} from '../bridge/collections.mjs';
import {monitorReport} from '../lib/monitor-report.mjs';
test('notification acceptance is not completion: pure status, active claims, no blind replay, explicit recovery and saved artifact suppression',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'completion'},r2Buckets:{BUCKET:'completion'},host:'127.0.0.1',port:0});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');await db.prepare('CREATE TABLE hunem_runtime(id TEXT PRIMARY KEY,value TEXT,revision INTEGER,updated_at INTEGER,lease TEXT,lease_until INTEGER)').run();
  let now=Date.parse('2026-10-27T12:00Z'),referenceReady=true;const sent=[];
  const service=collectionEventService({db,bucket,kind:'soda',now:()=>now,reference:async()=>({ready:referenceReady,errors:referenceReady?[]:['REFERENCE_HTTP_403']}),ready:async()=>referenceReady,fetcher:async(url,o)=>{const body=JSON.parse(o.body);if(body.type==='verification')return Response.json({challenge:body.challenge});sent.push(body);return new Response(null,{status:200});}});
  await service.rpc('events/subscribe',{name:'hunem.soda_purchased',arguments:{},delivery:{mode:'webhook',url:'https://chatgpt.com/mcp-events/completion',secret:'whsec_'+Buffer.alloc(32,9).toString('base64')},ttlMs:7*86400000},'owner','w');
  const soda=(id,time)=>({type:'expense',category:'soda',id,time,soda:{id,name:id}}),p={world:{publicationWorldId:'w',now:++now,events:[soda('history',now-5000),soda('current',now)]}};
  const id=collectionInventory(p,'soda',now).find(r=>r.name==='current').id;
  await service.process(p);assert.equal(sent.length,1);let s=await service.status(p);assert.equal(s.delivered,1);assert.equal(s.completion.complete,0);assert.equal(s.completion.items[0].state,'awaiting_image');assert.equal(s.completion.total,1,'never backfill before subscription watermark');
  const beforeDb=JSON.stringify((await db.prepare('SELECT * FROM hunem_runtime ORDER BY id').all()).results),beforeWorld=JSON.stringify(p);await service.status(p);assert.equal(JSON.stringify((await db.prepare('SELECT * FROM hunem_runtime ORDER BY id').all()).results),beforeDb);assert.equal(JSON.stringify(p),beforeWorld);
  now+=31*60000;p.world.now=now;const claimKey='collection-claim:soda:'+id;
  await db.prepare('INSERT INTO hunem_runtime(id,value,revision,updated_at,lease,lease_until) VALUES(?,?,0,?,?,?)').bind(claimKey,'{}',now,'active-drawing',now+60000).run();await service.process(p);assert.equal(sent.length,1);assert.equal((await service.status(p)).completion.items[0].state,'drawing');
  await db.prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=?').bind(claimKey).run();referenceReady=false;await service.process(p);assert.equal(sent.length,1);s=await service.status(p);assert.equal(s.completion.items[0].state,'attention_required');assert.equal(s.completion.blocked,1);assert.equal(s.completion.items[0].automaticRetries,0);assert.equal(s.completion.automaticReplayEnabled,false);
  const report=monitorReport({...p,world:{...p.world,realAt:now},eventPlan:{until:now+60000,offset:0,events:[{dueAt:now+30000}]}},{},{now,collections:{soda:s}});assert.ok(report.issues.some(i=>i.key==='collection:soda:'+id));assert.equal(report.health,'warning');
  referenceReady=true;await Promise.all([service.process(p),service.process(p)]);assert.equal(sent.length,1,'concurrent health checks cannot wake AI again');
  for(const minutes of [61,121]){now+=minutes*60000;p.world.now=now;await service.process(p);}assert.equal(sent.length,1);
  now+=241*60000;p.world.now=now;await service.process(p);assert.equal(sent.length,1,'silence does not start another task');s=await service.status(p);assert.equal(s.completion.items[0].state,'attention_required');
  await service.replay(p,id,'11111111-1111-4111-8111-111111111111');assert.equal(sent.length,2);assert.notEqual(sent[0].eventId,sent[1].eventId);assert.deepEqual(sent[0].data,sent[1].data);
  await assert.rejects(()=>service.recordFailure(p,id,'secret=https://private'),/INVALID_COLLECTION_FAILURE/);await service.recordFailure(p,id,'IMAGE_SAVE_FAILED');assert.equal((await service.status(p)).completion.items[0].lastError,'IMAGE_SAVE_FAILED');
  await db.prepare('INSERT INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind('collection:soda:'+id,JSON.stringify({sha256:'verified-fixture',src:'/fixture.png',thumbnail:'/fixture.jpg'}),now).run();await service.process(p);assert.equal(sent.length,2);s=await service.status(p);assert.equal(s.completion.complete,1);assert.equal(s.completion.pending,0);assert.equal((await service.recordFailure(p,id,'IMAGE_SAVE_FAILED')).state,'complete');
 }finally{await mf.dispose();}
});

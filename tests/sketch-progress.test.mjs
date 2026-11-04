import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {recordSketchStep,reportSketchProgress,dispatchSketch,observeSketchReceive} from '../bridge/sketch-progress.mjs';
import {collectionCompletionService} from '../bridge/collection-completion.mjs';
import {collectionEventService} from '../bridge/collection-events.mjs';
import {footprintEventService,visitEvent} from '../bridge/footprint-events.mjs';
import {selectedSketches} from '../bridge/sketch-lifecycle.mjs';

test('observed steps survive concurrency, classify receive failures, and suppress duplicate AI dispatch for all three kinds',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'progress'},r2Buckets:{BUCKET:'progress'},host:'127.0.0.1',port:0});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
  await db.prepare('CREATE TABLE hunem_runtime(id TEXT PRIMARY KEY,value TEXT,revision INTEGER,updated_at INTEGER,lease TEXT,lease_until INTEGER)').run();
  const get=async key=>JSON.parse((await db.prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(key).first()).value);
  const put=async(key,value,lease=null,until=null)=>db.prepare('INSERT OR REPLACE INTO hunem_runtime(id,value,revision,updated_at,lease,lease_until) VALUES(?,?,0,?,?,?)').bind(key,JSON.stringify(value),Date.now(),lease,until).run();
  const id='a'.repeat(32),now=Date.now();
  await Promise.all(Array.from({length:15},(_,i)=>recordSketchStep(db,'soda',id,'receiving',{now:now+i,bytes:i})));
  let progress=await get('sketch-progress:soda:'+id);assert.equal(progress.counts.receiving,15);assert.equal(progress.steps.length,12);assert.ok(progress.steps.every(s=>s.stage==='receiving'));
  await put('collection-claim:soda:'+id,{startedAt:now},'lease',now+60000);
  await assert.rejects(()=>reportSketchProgress({db,kind:'soda',id,lease:'wrong',stage:'image_generated'}),/CLAIM_REQUIRED/);
  await reportSketchProgress({db,kind:'soda',id,lease:'lease',stage:'reference_ready'});
  await reportSketchProgress({db,kind:'soda',id,lease:'lease',stage:'image_generated'});
  const args={db,kind:'soda',id,lease:'lease'},read=async()=>({bytes:Buffer.from('fixture')});
  await assert.rejects(()=>observeSketchReceive(args,async()=>{throw Error('private URL must not leak');},async()=>{}));
  assert.equal((await get('sketch-progress:soda:'+id)).steps.at(-1).code,'FILE_TRANSFER_FAILED');
  await assert.rejects(()=>observeSketchReceive(args,read,async()=>{throw Error('TRANSPARENT_SUBJECT_REQUIRED');}));
  assert.equal((await get('sketch-progress:soda:'+id)).steps.at(-1).code,'IMAGE_VALIDATION_FAILED');
  await assert.rejects(()=>observeSketchReceive(args,read,async()=>{throw Error('R2 unavailable');}));
  progress=await get('sketch-progress:soda:'+id);assert.equal(progress.steps.at(-1).code,'IMAGE_SAVE_FAILED');assert.ok(!JSON.stringify(progress).includes('private URL'));
  const sent=[];let clock=now;
  const fetcher=async(url,o)=>{const body=JSON.parse(o.body);if(body.type==='verification')return Response.json({challenge:body.challenge});sent.push(body);return new Response(null,{status:200});};
  const p={world:{publicationWorldId:'w',now:clock,events:[]},eventPlan:{createdAt:clock,steps:[{patch:[[['events'],1,[
   {type:'expense',category:'meal',id:'m',time:clock+60000,food:{name:'Risotto',localDish:true,source:'https://example.org/food',cityId:'a'}},
   {type:'expense',category:'soda',id:'s',time:clock+60000,soda:{id:'orange',name:'Orange'}},
   {type:'visit',time:clock+60000,place:{topicId:'church',name:'Church',p:[9,54]}}
  ]]]}]}};
  for(const kind of ['meal','soda','footprint']){
   const service=kind==='footprint'?footprintEventService({db,bucket,fetcher,now:()=>clock}):collectionEventService({db,bucket,kind,fetcher,now:()=>clock});
   for(const suffix of ['one','two','three'])await service.rpc('events/subscribe',{name:kind==='footprint'?visitEvent:kind==='meal'?'hunem.meal_completed':'hunem.soda_purchased',delivery:{mode:'webhook',url:'https://chatgpt.com/mcp-events/'+kind+suffix,secret:'whsec_'+Buffer.alloc(32,5).toString('base64')}},'owner','w');
   const before=sent.length;await Promise.all([service.process(p),service.process(p)]);await service.process(p);assert.equal(sent.length,before+1,'two subscriptions notify each subject only once');
   clock+=31*60000;await service.process(p);assert.equal(sent.length,before+1,'no automatic replay after acceptance');
   const row=selectedSketches(p,kind)[0],claimKey=kind==='footprint'?'footprint-claim:'+row.id:`collection-claim:${kind}:${row.id}`;
   await service.replay(p,row.id,'11111111-1111-4111-8111-111111111111');
   await service.process(p);assert.equal(sent.length,before+2,'one manual request across subscriptions wakes only one task');
   await service.replay(p,row.id,'22222222-2222-4222-8222-222222222222');
   await service.process(p);await service.process(p);assert.equal(sent.length,before+3,'later manual request cannot revive an older request on a delayed subscription');
   await put(claimKey,{startedAt:clock-1000},'expired',clock-1);
   let calls=0;await dispatchSketch({db,kind,id:row.id,now:clock},async()=>calls++);assert.equal(calls,0,'expiry alone never authorizes another task');
   await put(claimKey,{startedAt:clock},'active',clock+60000);
   await dispatchSketch({db,kind,id:row.id,now:clock,manual:true},async()=>calls++);assert.equal(calls,0,'manual replay also respects active work');
   await put(claimKey,{startedAt:clock-1000},'expired',clock-1);
   await dispatchSketch({db,kind,id:row.id,now:clock,manual:true},async()=>calls++);assert.equal(calls,1,'explicit recovery remains possible');
   const completion=collectionCompletionService({db,kind,now:()=>clock});await completion.failure(p,row.id,'RATE_LIMITED');
   const status=await completion.state(p);assert.equal(status.items[0].lastError,'RATE_LIMITED');assert.equal(status.automaticReplayEnabled,false);
   assert.equal(status.items[0].usage.tokens,null);assert.equal(status.items[0].taskStartedAt,clock-1000);
   clock=now;
  }
 }finally{await mf.dispose();}
});

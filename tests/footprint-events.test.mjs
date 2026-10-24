import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {footprintEventService,visitEvent,signedHeaders,callbackUrl} from '../bridge/footprint-events.mjs';
import {footprintId} from '../bridge/footprints.mjs';
const secret='whsec_'+Buffer.alloc(32,5).toString('base64');
test('callback policy blocks private, unrelated and credential-bearing destinations; standard webhook signature matches independent verifier',()=>{
 for(const url of ['http://chatgpt.com/cb','https://127.0.0.1/cb','https://chatgpt.com.evil.test/cb','https://user:pass@chatgpt.com/cb','https://chatgpt.com:444/cb','https://example.com/cb'])assert.throws(()=>callbackUrl(url));
 const h=signedHeaders(secret,'event1','{"hello":1}',1700000000000,'subscription1');assert.equal(h['webhook-signature'],'v1,'+createHmac('sha256',Buffer.alloc(32,5)).update('event1.1700000000.{"hello":1}').digest('base64'));
});
test('real isolated D1: subscription verification, stable replay IDs, committed-only visits, retry leases, expiry and unsubscribe',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'footprint-event-isolated'},r2Buckets:{BUCKET:'footprint-event-isolated'},host:'127.0.0.1',port:0});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');await db.prepare('CREATE TABLE hunem_runtime(id TEXT PRIMARY KEY,value TEXT,revision INTEGER,updated_at INTEGER,lease TEXT,lease_until INTEGER)').run();
  let now=1792800000000,mode='ok',sent=[],verifications=0;
  const fetcher=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(options.redirect,'manual');if(body.type==='verification'){verifications++;return Response.json({challenge:mode==='bad'?'wrong':body.challenge});}sent.push({body,headers:options.headers});return new Response(null,{status:mode==='failure'?503:mode==='gone'?410:202});};
  const service=()=>footprintEventService({db,bucket,now:()=>now,fetcher});
  const args={name:visitEvent,arguments:{},delivery:{mode:'webhook',url:'https://chatgpt.com/mcp-events/isolated-test',secret},ttlMs:3600000};
  await assert.rejects(()=>service().rpc('events/subscribe',args,'','w'),/OWNER_REQUIRED/);
  mode='bad';await assert.rejects(()=>service().rpc('events/subscribe',args,'owner','w'),/VERIFICATION_FAILED/);assert.equal((await service().status()).activeSubscriptions,0);
  mode='ok';const subscribed=await service().rpc('events/subscribe',args,'owner','w');const v=verifications;assert.equal((await service().rpc('events/subscribe',args,'owner','w')).id,subscribed.id);assert.equal(verifications,v);
  const event=(id,time=now-1000)=>({type:'visit',time,place:{topicId:id,name:id,p:[9,54]}}),p={world:{publicationWorldId:'w',now,events:[event('one'),event('two'),event('future',now+60000),{...event('generic'),place:{generic:true}}]}};
  const before=JSON.stringify(p);mode='failure';await service().process(p);assert.equal(sent.length,2);assert.equal((await service().status()).retrying,2);
  await service().process(p);assert.equal(sent.length,2,'retry must respect nextAt');now+=3*60000;mode='ok';
  await Promise.all([service().process(p),service().process(p)]);assert.equal(sent.length,4,'concurrent retries send each event once');assert.equal(sent[0].body.eventId,sent[2].body.eventId);assert.equal((await service().status()).delivered,2);assert.equal(JSON.stringify(p),before);
  const serialized=JSON.stringify(await service().status());assert.ok(!serialized.includes(secret)&&!serialized.includes('https://chatgpt.com'));
  await service().process(p);assert.equal(sent.length,4,'already acknowledged events never repeat');
  p.world.events.push(event('drawn',p.world.now-2));await db.prepare('INSERT INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind('footprint:'+footprintId('w','drawn'),'{}',now).run();await service().process(p);assert.equal(sent.length,4,'writing images never creates a visit or sends drawn visits');
  p.world.events.push(event('gone',p.world.now-1));mode='gone';await service().process(p);assert.equal((await service().status()).stopped,1);now+=30*60000;await service().process(p);assert.equal(sent.length,5,'410 is terminal');
  await service().rpc('events/unsubscribe',args,'other-owner','w');assert.equal((await service().status()).activeSubscriptions,1,'another owner cannot cancel original subscription');
  await service().rpc('events/unsubscribe',args,'owner','w');assert.equal((await service().status()).activeSubscriptions,0);
  mode='ok';await service().rpc('events/subscribe',args,'owner','w');now+=3600001;assert.equal((await service().status()).activeSubscriptions,0);assert.equal((await service().process(p)).delivered,0);
  assert.ok(await bucket.get('backups/manual-before-footprint-events-20261024.json'));
 }finally{await mf.dispose();}
});

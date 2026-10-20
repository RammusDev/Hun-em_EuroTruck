import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {signBackground,verifyBackground} from '../lib/background-auth.mjs';
import {isKeyTime,trigger} from '../external-timer/worker.mjs';
import {advanceCloud} from '../bridge/advance.mjs';

const endpoint='https://background-isolation.test/api/background-tick',secret=randomBytes(32).toString('base64url'),worldId='isolated-world';
const config={BACKGROUND_TICK_SECRET:secret,BACKGROUND_TICK_WORLD_ID:worldId,BACKGROUND_TICK_ORIGIN:new URL(endpoint).origin};
test('background auth fails closed, binds world/origin/body, rejects expiry and accepts no owner cookie',async()=>{
 const now=Date.now(),req=()=>signBackground(endpoint,secret,worldId,{now});
 await assert.rejects(()=>verifyBackground(new Request(endpoint),{},now),{status:503});
 assert.equal((await verifyBackground(await req(),config,now)).worldId,worldId);
 await assert.rejects(async()=>verifyBackground(await signBackground(endpoint,secret,worldId,{now:now-61000}),config,now),{status:401});
 await assert.rejects(async()=>verifyBackground(await signBackground(endpoint,secret,'other',{now}),config,now),{status:403});
 const r=await req(),body=await r.text();
 await assert.rejects(()=>verifyBackground(new Request(endpoint,{method:'POST',headers:r.headers,body:body.replace(worldId,'other-world')}),config,now),{status:401});
 await assert.rejects(async()=>verifyBackground(await req(),{...config,BACKGROUND_TICK_ORIGIN:'https://other.test'},now),{status:503});
 await assert.rejects(async()=>verifyBackground(await req(),{...config,BACKGROUND_TICK_SECRET:randomBytes(32).toString('base64url')},now),{status:401});
});
test('background rejects oversized and extra-field requests even when correctly signed',async()=>{
 // A signature authenticates transport, not authority to supply arbitrary fields.
 const now=Date.now(),req=await signBackground(endpoint,secret,worldId,{now});
 const huge=new Request(endpoint,{method:'POST',headers:req.headers,body:'x'.repeat(513)});
 await assert.rejects(()=>verifyBackground(huge,config,now),{status:413});
 const body=JSON.stringify({worldId,requestId:crypto.randomUUID(),target:now+86400000}),timestamp=String(now),url=new URL(endpoint);
 const encoder=new TextEncoder(),hex=b=>Buffer.from(b).toString('hex'),digest=hex(await crypto.subtle.digest('SHA-256',encoder.encode(body)));
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=hex(await crypto.subtle.sign('HMAC',key,encoder.encode(['hunem-background-v1','POST',url.origin,url.pathname,timestamp,digest].join('\n'))));
 await assert.rejects(()=>verifyBackground(new Request(endpoint,{method:'POST',headers:{'content-type':'application/json','x-hunem-tick-time':timestamp,'x-hunem-tick-signature':signature},body}),config,now),{status:403});
});
test('timer filters summer/winter and daylight-saving transition dates using Berlin local time',()=>{
 for(const date of ['2026-01-20','2026-07-20','2026-03-29','2026-10-25']){
  let calls=0;for(let m=0;m<1440;m+=15)if(isKeyTime(Date.parse(date+'T00:00Z')+m*60000))calls++;
  assert.equal(calls,5,date);
 }
 assert.equal(isKeyTime(Date.parse('2026-10-20T14:15Z')),true);
 assert.equal(isKeyTime(Date.parse('2026-10-20T15:15Z')),false);
});
test('external sender refuses redirects and auth failures without sending platform credentials',async()=>{
 const env={TICK_ENDPOINT:endpoint,TICK_SECRET:secret,TICK_WORLD_ID:worldId};
 await assert.rejects(()=>trigger(env,{fetcher:async()=>new Response('',{status:302})}),/HTTP 302/);
 await assert.rejects(()=>trigger(env,{fetcher:async()=>new Response('',{status:401})}),/HTTP 401/);
 await assert.rejects(()=>trigger({...env,TICK_ENDPOINT:endpoint.replace('https:','http:')}),/Invalid background endpoint/);
 const r=await trigger(env,{fetcher:async(req,options)=>{
  assert.equal(req.headers.has('cookie'),false);assert.equal(req.headers.has('oai-sites-authorization'),false);assert.equal(options.redirect,'manual');
  await verifyBackground(req,config);
  return Response.json({worldId,action:'advanced'});
 }});assert.equal(r.action,'advanced');
});
test('actual-stop research is reserved and completes inside tick before leisure is selected',async()=>{
 const h=3600000,entries={},calls=[],p={world:{now:15*h,realAt:15*h,speed:1,diaries:[]},routes:{}};
 let actual={key:'forecast'};
 const core={topicPolicy:{radiusMeters:15000},plannedTopicAnchors:()=>[{key:'forecast'}],actualTopicAnchor:()=>actual,
  createTopicResearcher:()=>({entries,schedule:async(_s,{anchors})=>{for(const a of anchors){entries[a.key]={researchPolicy:'passenger-v2:15000',retryAt:30*h};calls.push('research:'+a.key);}}}),
  tick:async(s,to,_route,_random,hooks)=>{s.now=to;if(to===17*h){actual={key:'unexpected-stop'};await hooks.beforeLeisure();assert.ok(entries['unexpected-stop']);calls.push('choose-outing');}},
  reconcilePublications(){},syncTeaching(){}};
 await advanceCloud(p,core,19*h);
 assert.deepEqual(calls,['research:forecast','research:unexpected-stop','choose-outing']);
});

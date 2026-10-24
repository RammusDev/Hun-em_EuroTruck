import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {footprintInventory} from './footprints.mjs';
export const visitEvent='hunem.landmark_visited';
const hash=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(x,Object.keys(x).sort());
export function callbackUrl(value){
 const u=new URL(value);
 // Platform callbacks only. Never turn authenticated subscriptions into arbitrary URL fetches.
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!['chatgpt.com','openai.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw Error('INVALID_CALLBACK');
 return u.href;
}
export function signingKey(secret){
 if(typeof secret!=='string'||!/^whsec_[A-Za-z0-9+/_-]+={0,2}$/.test(secret))throw Error('INVALID_SIGNING_SECRET');
 const key=Buffer.from(secret.slice(6),'base64');if(key.length<24||key.length>64)throw Error('INVALID_SIGNING_SECRET');return key;
}
export function signedHeaders(secret,id,body,now=Date.now(),subscriptionId=''){
 const timestamp=String(Math.floor(now/1000)),signature=createHmac('sha256',signingKey(secret)).update(id+'.'+timestamp+'.'+body).digest('base64');
 return {'Content-Type':'application/json','webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':'v1,'+signature,'X-MCP-Subscription-Id':subscriptionId};
}
const eventDefinition={name:visitEvent,description:'Hun-em completed a real visit to a named landmark whose permanent sketch is still missing. Draw that landmark now using the footprint tools; no journal work. Generated image writes do not create another visit event.',delivery:['webhook'],inputSchema:{type:'object',properties:{},additionalProperties:false},payloadSchema:{type:'object',properties:{worldId:{type:'string'},footprintId:{type:'string'},name:{type:'string'},visitedAt:{type:'number'},url:{type:'string'}},required:['worldId','footprintId','name','visitedAt','url'],additionalProperties:false}};
export function footprintEventService({db,bucket,fetcher=fetch,now=Date.now}){
 const get=async id=>{const r=await db.prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(id).first();return r?JSON.parse(r.value):null;};
 const put=async(id,value)=>db.prepare('INSERT INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,revision=revision+1,updated_at=excluded.updated_at').bind(id,JSON.stringify(value),now()).run();
 const all=async prefix=>(await db.prepare('SELECT id,value FROM hunem_runtime WHERE id LIKE ?').bind(prefix+'%').all()).results.map(r=>({key:r.id,...JSON.parse(r.value)}));
 const active=s=>s.expiresAt>now()&&s.enabled;
 async function rpc(method,args,owner,worldId){
  if(!owner)throw Error('OWNER_REQUIRED');
  if(method==='events/list')return {events:[eventDefinition]};
  const filters=args?.arguments??{};
  if(!['events/subscribe','events/unsubscribe'].includes(method)||args?.name!==visitEvent||!filters||typeof filters!=='object'||Array.isArray(filters)||Object.keys(filters).length||!args.delivery)throw Error('INVALID_EVENT_ARGUMENTS');
  const url=callbackUrl(args.delivery.url),id='mcp-event-sub:'+hash(owner+'\n'+worldId+'\n'+visitEvent+'\n'+url+'\n'+canonical(filters)).slice(0,32);
  if(method==='events/unsubscribe'){const old=await get(id);if(old)await put(id,{...old,enabled:false});return {};}
  if(args.delivery.mode!=='webhook')throw Error('WEBHOOK_REQUIRED');signingKey(args.delivery.secret);
  const subs=await all('mcp-event-sub:');if(subs.filter(active).length>=3&&!subs.some(s=>s.key===id))throw Error('SUBSCRIPTION_LIMIT');
  const requested=args.ttlMs===undefined||args.ttlMs===null?7*86400000:args.ttlMs;
  if(!Number.isFinite(requested)||requested<60000)throw Error('INVALID_TTL');
  const previous=await get(id),cached=previous?.secret===args.delivery.secret&&previous?.verifiedAt>now()-30*60000;
  const body=JSON.stringify({type:'verification',challenge:randomUUID()}),challenge=JSON.parse(body).challenge;
  let response;
  try{response=cached?Response.json({challenge}):await fetcher(url,{method:'POST',headers:signedHeaders(args.delivery.secret,'verify_'+randomUUID(),body,now(),id),body,redirect:'manual',signal:AbortSignal.timeout(8000)});}catch{throw Object.assign(Error('CALLBACK_VERIFICATION_FAILED'),{rpcCode:-32015,reason:'timeout'});}
  let returned='';try{returned=String((await response.json()).challenge||'');}catch{}
  const a=Buffer.from(returned),b=Buffer.from(challenge);
  if(!response.ok||a.length!==b.length||!timingSafeEqual(a,b))throw Object.assign(Error('CALLBACK_VERIFICATION_FAILED'),{rpcCode:-32015,reason:'challenge_failed'});
  const expiresAt=now()+Math.min(requested,7*86400000);
  const backup='backups/manual-before-footprint-events-20261024.json';
  if(!(await bucket.get(backup)))await bucket.put(backup,JSON.stringify({subscriptions:subs,at:now()}),{httpMetadata:{contentType:'application/json'}});
  await put(id,{owner,worldId,url,secret:args.delivery.secret,enabled:true,expiresAt,verifiedAt:cached?previous.verifiedAt:now(),createdAt:previous?.createdAt||now(),...(previous?.secret&&previous.secret!==args.delivery.secret?{oldSecret:previous.secret,oldSecretUntil:now()+30000}:{})});
  return {id,refreshBefore:new Date(expiresAt).toISOString(),cursor:null,truncated:false};
 }
 const eventKey=(sub,row)=>'visit_'+hash(sub.key+'\n'+row.id).slice(0,40);
 async function replay(payload,id,requestId){
  if(!/^[a-f0-9]{32}$/.test(id)||!/^[a-f0-9-]{36}$/.test(requestId))throw Error('INVALID_REPLAY');
  const row=footprintInventory(payload,Math.min(now(),payload.world.now)).find(r=>r.id===id);if(!row)throw Error('VISIT_REQUIRED');
  if(await get('footprint:'+id))return {id,action:'already-drawn'};
  const subs=(await all('mcp-event-sub:')).filter(s=>active(s)&&s.worldId===payload.world.publicationWorldId);
  if(!subs.length)throw Error('NO_ACTIVE_SUBSCRIPTION');
  let queued=0;
  for(const sub of subs){
   const key='footprint-event:'+eventKey(sub,row),lease=randomUUID();
   const locked=await db.prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING value').bind(lease,now()+30000,key,now()).first();
   if(!locked)continue;
   try{
    const saved=JSON.parse(locked.value),requests=saved.replayRequests||[];
    if(requests.some(r=>r.id===requestId))continue;
    if(saved.status==='pending')continue;
    if(requests.filter(r=>r.at>now()-86400000).length>=3)throw Error('REPLAY_DAILY_LIMIT');
    await put(key,{...saved,status:'pending',attempts:0,nextAt:0,generation:(saved.generation||0)+1,replayRequests:[...requests,{id:requestId,at:now()}].slice(-10)});queued++;
   }finally{await db.prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(key,lease).run();}
  }
  return {id,action:queued?'replayed':'unchanged',queued,...await process(payload,id)};
 }
 async function process(payload,onlyId){
  const subscriptions=(await all('mcp-event-sub:')).filter(s=>active(s)&&s.worldId===payload.world.publicationWorldId);
  if(!subscriptions.length)return {subscriptions:0,delivered:0};
  const images=new Set((await all('footprint:')).map(r=>r.key.slice(10))),pending=footprintInventory(payload,Math.min(now(),payload.world.now)).filter(r=>!images.has(r.id)&&(!onlyId||r.id===onlyId));
  let delivered=0,attempted=0;
  for(const sub of subscriptions)for(const row of pending){
   if(attempted>=2)return {subscriptions:subscriptions.length,delivered};
   const baseId=eventKey(sub,row),key='footprint-event:'+baseId;
   const old=await get(key);if(old&&(old.status==='sent'||old.status==='stopped'||old.nextAt>now()))continue;
   // Same event ID survives response loss and retries. A short D1 lease prevents concurrent deliveries.
   await db.prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(key,JSON.stringify({status:'pending',attempts:0,nextAt:0}),now()).run();
   const lease=randomUUID(),locked=await db.prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING value').bind(lease,now()+30000,key,now()).first();
   if(!locked)continue;
   try{
    const saved=JSON.parse(locked.value);if(saved.status==='sent'||saved.status==='stopped'||saved.nextAt>now())continue;
    attempted++;const eventId=saved.generation?baseId+'_r'+saved.generation:baseId;
    const body=JSON.stringify({eventId,name:visitEvent,timestamp:new Date(row.firstSeenAt).toISOString(),data:{worldId:payload.world.publicationWorldId,footprintId:row.id,name:row.name,visitedAt:row.firstSeenAt,url:'https://hun-em-europe.honeygrass8.chatgpt.site/journey'},cursor:null});
    let status=0;try{const headers=signedHeaders(sub.secret,eventId,body,now(),sub.key);if(sub.oldSecretUntil>now())headers['webhook-signature']+=' '+signedHeaders(sub.oldSecret,eventId,body,now(),sub.key)['webhook-signature'];const r=await fetcher(callbackUrl(sub.url),{method:'POST',headers,body,redirect:'manual',signal:AbortSignal.timeout(8000)});status=r.status;await r.body?.cancel();}catch{}
    const attempts=(saved.attempts||0)+1,accepted=status>=200&&status<300;
    await put(key,{...saved,status:accepted?'sent':[410,413].includes(status)||attempts>=8?'stopped':'pending',attempts,httpStatus:status,nextAt:now()+Math.min(30,2**Math.min(attempts,5))*60000,at:now(),footprintId:row.id});
    if(accepted)delivered++;
   }finally{await db.prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(key,lease).run();}
  }
  return {subscriptions:subscriptions.length,delivered};
 }
 async function status(){const subs=await all('mcp-event-sub:'),events=await all('footprint-event:');return {activeSubscriptions:subs.filter(active).length,expiredSubscriptions:subs.filter(s=>s.enabled&&!active(s)).length,delivered:events.filter(e=>e.status==='sent').length,retrying:events.filter(e=>e.status==='pending').length,stopped:events.filter(e=>e.status==='stopped').length,latestDelivery:events.filter(e=>e.at).sort((a,b)=>b.at-a.at).slice(0,3).map(e=>({footprintId:e.footprintId,status:e.status,httpStatus:e.httpStatus,at:e.at,attempts:e.attempts}))};}
 return {rpc,process,status,replay};
}

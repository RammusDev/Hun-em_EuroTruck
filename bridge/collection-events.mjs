import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {collectionInventory} from './collections.mjs';
import {callbackUrl,signingKey,signedHeaders} from './footprint-events.mjs';
export const collectionEventNames={meal:'hunem.meal_completed',soda:'hunem.soda_purchased'};
const hash=s=>createHash('sha256').update(s).digest('hex');
export const collectionEventDefinitions=Object.entries(collectionEventNames).map(([kind,name])=>({name,description:kind==='meal'?'A sourced local specialty meal was actually finished; its collection sketch is missing. Process only this collectionId.':'A soda product was actually purchased; its collection sketch is missing. Purchase time is the collection and drawing trigger, not evidence that drinking is already finished.',delivery:['webhook'],inputSchema:{type:'object',properties:{},additionalProperties:false},payloadSchema:{type:'object',properties:{worldId:{type:'string'},collectionId:{type:'string'},kind:{type:'string',enum:[kind]},name:{type:'string'},recordedAt:{type:'number'},url:{type:'string'}},required:['worldId','collectionId','kind','name','recordedAt','url'],additionalProperties:false}}));
export function collectionEventService({db,bucket,kind,fetcher=fetch,now=Date.now}){
 const name=collectionEventNames[kind];if(!name)throw Error('INVALID_COLLECTION_KIND');
 const subPrefix='collection-event-sub:'+kind+':',deliveryPrefix='collection-event:'+kind+':';
 const get=async id=>{const row=await db.prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(id).first();return row?JSON.parse(row.value):null;};
 const put=async(id,value)=>db.prepare('INSERT INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,revision=revision+1,updated_at=excluded.updated_at').bind(id,JSON.stringify(value),now()).run();
 const all=async prefix=>(await db.prepare('SELECT id,value FROM hunem_runtime WHERE id LIKE ?').bind(prefix+'%').all()).results.map(r=>({key:r.id,...JSON.parse(r.value)}));
 const active=s=>s.enabled&&s.expiresAt>now();
 async function rpc(method,args,owner,worldId){
  if(!owner)throw Error('OWNER_REQUIRED');
  if(method==='events/list')return {events:collectionEventDefinitions.filter(d=>d.name===name)};
  const filters=args?.arguments??{};
  if(!['events/subscribe','events/unsubscribe'].includes(method)||args?.name!==name||!filters||typeof filters!=='object'||Array.isArray(filters)||Object.keys(filters).length||!args.delivery)throw Error('INVALID_EVENT_ARGUMENTS');
  const url=callbackUrl(args.delivery.url),id=subPrefix+hash(owner+'\n'+worldId+'\n'+name+'\n'+url).slice(0,32),previous=await get(id);
  if(method==='events/unsubscribe'){if(previous)await put(id,{...previous,enabled:false});return {};}
  if(args.delivery.mode!=='webhook')throw Error('WEBHOOK_REQUIRED');signingKey(args.delivery.secret);
  const subs=await all(subPrefix);if(subs.filter(active).length>=3&&!previous)throw Error('SUBSCRIPTION_LIMIT');
  const requested=args.ttlMs??7*86400000;if(!Number.isFinite(requested)||requested<60000)throw Error('INVALID_TTL');
  const cached=previous?.secret===args.delivery.secret&&previous?.verifiedAt>now()-30*60000;
  if(!cached){
   const challenge=randomUUID(),body=JSON.stringify({type:'verification',challenge});let r;
   try{r=await fetcher(url,{method:'POST',headers:signedHeaders(args.delivery.secret,'verify_'+randomUUID(),body,now(),id),body,redirect:'manual',signal:AbortSignal.timeout(8000)});}catch{throw Object.assign(Error('CALLBACK_VERIFICATION_FAILED'),{rpcCode:-32015,reason:'timeout'});}
   let echoed='';try{echoed=String((await r.json()).challenge||'');}catch{}
   const a=Buffer.from(echoed),b=Buffer.from(challenge);if(!r.ok||a.length!==b.length||!timingSafeEqual(a,b))throw Object.assign(Error('CALLBACK_VERIFICATION_FAILED'),{rpcCode:-32015,reason:'challenge_failed'});
  }
  const backup='backups/manual-before-collection-events-20261025.json';if(!(await bucket.get(backup)))await bucket.put(backup,JSON.stringify({at:now(),subscriptions:[...await all('collection-event-sub:')]}),{httpMetadata:{contentType:'application/json'}});
  const expiresAt=now()+Math.min(requested,7*86400000);
  await put(id,{owner,worldId,name,url,secret:args.delivery.secret,enabled:true,expiresAt,createdAt:previous?.createdAt??now(),verifiedAt:cached?previous.verifiedAt:now(),...(previous?.secret&&previous.secret!==args.delivery.secret?{oldSecret:previous.secret,oldSecretUntil:now()+30000}:{})});
  return {id,refreshBefore:new Date(expiresAt).toISOString(),cursor:null,truncated:false};
 }
 async function process(payload,onlyId){
  const subs=(await all(subPrefix)).filter(s=>active(s)&&s.worldId===payload.world.publicationWorldId);
  const images=new Set((await all('collection:'+kind+':')).map(r=>r.key.split(':')[2]));
  const rows=collectionInventory(payload,kind,Math.min(now(),payload.world.now)).filter(r=>r.sketchEligible&&!images.has(r.id)&&(!onlyId||r.id===onlyId));
  let delivered=0,attempted=0;
  for(const sub of subs)for(const row of rows){
   // Subscription start is a durable watermark: history appears in the UI but never floods AI.
   const occurrence=row.occurrences.filter(e=>e.time>=sub.createdAt).sort((a,b)=>a.time-b.time)[0];if(!occurrence)continue;
   if(attempted>=2)return {subscriptions:subs.length,delivered};
   const eventId=kind+'_'+hash(sub.key+'\n'+row.id).slice(0,40),key=deliveryPrefix+eventId,old=await get(key);
   if(old&&(old.status==='sent'||old.status==='stopped'||old.nextAt>now()))continue;
   await db.prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(key,JSON.stringify({status:'pending',attempts:0,nextAt:0,collectionId:row.id,recordedAt:occurrence.time}),now()).run();
   const lease=randomUUID(),locked=await db.prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING value').bind(lease,now()+30000,key,now()).first();if(!locked)continue;
   try{
    const saved=JSON.parse(locked.value);if(['sent','stopped'].includes(saved.status)||saved.nextAt>now())continue;attempted++;
    const deliveryId=saved.generation?eventId+'_r'+saved.generation:eventId,at=saved.recordedAt??occurrence.time;
    const body=JSON.stringify({eventId:deliveryId,name,timestamp:new Date(at).toISOString(),data:{worldId:payload.world.publicationWorldId,collectionId:row.id,kind,name:row.name,recordedAt:at,url:'https://hun-em-europe.honeygrass8.chatgpt.site/journey'},cursor:null});
    let status=0;try{const headers=signedHeaders(sub.secret,deliveryId,body,now(),sub.key);if(sub.oldSecretUntil>now())headers['webhook-signature']+=' '+signedHeaders(sub.oldSecret,deliveryId,body,now(),sub.key)['webhook-signature'];const r=await fetcher(callbackUrl(sub.url),{method:'POST',headers,body,redirect:'manual',signal:AbortSignal.timeout(8000)});status=r.status;await r.body?.cancel();}catch{}
    const attempts=(saved.attempts||0)+1,accepted=status>=200&&status<300;
    await put(key,{...saved,status:accepted?'sent':[410,413].includes(status)||attempts>=8?'stopped':'pending',attempts,httpStatus:status,nextAt:now()+Math.min(30,2**Math.min(attempts,5))*60000,at:now()});if(accepted)delivered++;
   }finally{await db.prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(key,lease).run();}
  }
  return {subscriptions:subs.length,delivered};
 }
 async function replay(payload,id,requestId){
  if(!/^[a-f0-9]{32}$/.test(id)||!/^[a-f0-9-]{36}$/.test(requestId))throw Error('INVALID_REPLAY');
  if(!(collectionInventory(payload,kind,Math.min(now(),payload.world.now))).some(r=>r.id===id&&r.sketchEligible))throw Error('RECORDED_SPECIALTY_OR_PURCHASE_REQUIRED');
  if(await get('collection:'+kind+':'+id))return {kind,id,action:'already-drawn'};
  let queued=0;for(const e of await all(deliveryPrefix)){
   if(e.collectionId!==id)continue;const lease=randomUUID(),locked=await db.prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING value').bind(lease,now()+30000,e.key,now()).first();if(!locked)continue;
   try{const saved=JSON.parse(locked.value),requests=saved.replayRequests||[];if(requests.some(r=>r.id===requestId)||saved.status==='pending')continue;if(requests.filter(r=>r.at>now()-86400000).length>=3)throw Error('REPLAY_DAILY_LIMIT');await put(e.key,{...saved,status:'pending',attempts:0,nextAt:0,generation:(saved.generation||0)+1,replayRequests:[...requests,{id:requestId,at:now()}].slice(-10)});queued++;}finally{await db.prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(e.key,lease).run();}
  }return {kind,id,action:queued?'replayed':'unchanged',queued,...await process(payload,id)};
 }
 async function status(){const subs=await all(subPrefix),events=await all(deliveryPrefix);return {kind,name,activeSubscriptions:subs.filter(active).length,expiredSubscriptions:subs.filter(s=>s.enabled&&!active(s)).length,delivered:events.filter(e=>e.status==='sent').length,retrying:events.filter(e=>e.status==='pending').length,stopped:events.filter(e=>e.status==='stopped').length,latestDelivery:events.filter(e=>e.at).sort((a,b)=>b.at-a.at).slice(0,3).map(e=>({collectionId:e.collectionId,recordedAt:e.recordedAt,status:e.status,httpStatus:e.httpStatus,at:e.at,attempts:e.attempts}))};}
 return {rpc,process,status,replay};
}

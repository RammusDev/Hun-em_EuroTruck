import {env} from 'cloudflare:workers';
import {transaction,engine,committed,stateView} from './runtime';
import {runMonitor} from './monitor-store.mjs';
import {advanceCloud} from '../bridge/advance.mjs';
import {verifyBackground} from './background-auth.mjs';
import {runEventClock,eventSchedule} from '../bridge/event-runtime.mjs';

export async function backgroundTick(req:Request){
 const now=Date.now(),args=await verifyBackground(req,env,now);
 if(args.health){const p=await committed();try{await runMonitor(p,stateView(p),env);}catch{console.log('monitor-check-failed');}return {worldId:args.worldId,action:'health',now:p.world.now,...eventSchedule(p)};}
 // The receipt and updated world are committed by the same existing D1 CAS.
 // A failed computation/commit cannot consume a request ID permanently.
 return transaction(async(p:any)=>{
  if(p.world.publicationWorldId!==args.worldId||p.world.speed!==1)throw Object.assign(Error('Background world mismatch'),{status:409});
  if((env as any).EVENT_ARCHITECTURE==='true'){
   if(!p.eventArchitecture){
    const key='backups/manual-before-event-architecture-20261020.json';
    const bucket=env.BUCKET as R2Bucket;if(!(await bucket.get(key)))await bucket.put(key,JSON.stringify(p));
    await advanceCloud(p,engine,now);p.eventArchitecture={version:1,enabledAt:now,backupKey:key};p.world.eventMode=true;
   }
   p.eventReceipts??={};
   if(args.event){
    if(p.eventReceipts[args.event.id])return {worldId:args.worldId,action:'duplicate',now:p.world.now,...eventSchedule(p)};
    const event=p.eventPlan?.events.find((e:any)=>e.id===args.event.id&&e.version===args.event.version);
    if(!event)return {worldId:args.worldId,action:'stale',now:p.world.now,...eventSchedule(p)};
    if(event.dueAt>now)throw Object.assign(Error('Event is not due'),{status:409});
   }
   const due=args.event?p.eventPlan.events.find((e:any)=>e.id===args.event.id):null;
   if(p.eventPlan?.events?.some((e:any)=>e.dueAt<now-10*60000)){
    const bucket=env.BUCKET as R2Bucket,key='backups/manual-before-event-recovery-'+engine.realDay(now)+'.json';
    if(!(await bucket.get(key)))await bucket.put(key,JSON.stringify(p));
   }
   const schedule=await runEventClock(p,engine,{real:now,prepare:!args.event||due?.kind==='prepare',beforeShoreChange:async(p:any)=>{const bucket=env.BUCKET as R2Bucket,key='backups/manual-before-ferry-city-'+p.world.job.start+'.json';if(!(await bucket.get(key)))await bucket.put(key,JSON.stringify(p));}});
   if(args.event)p.eventReceipts[args.event.id]={at:now,version:args.event.version};
   const keys=Object.keys(p.eventReceipts);for(const key of keys.slice(0,Math.max(0,keys.length-2048)))delete p.eventReceipts[key];
   Object.assign(p.files,engine.changes());
   return {worldId:args.worldId,action:'advanced',now:p.world.now,lagMs:Math.max(0,now-p.world.realAt),...schedule};
  }
  const previous=p.backgroundTicks?.receipts?.[args.requestId];
  if(previous)return {...previous,action:'duplicate'};
  const receipts=Object.fromEntries(Object.entries(p.backgroundTicks?.receipts||{}).filter(([,v]:[string,any])=>v.acceptedAt>=now-120000));
  if(Object.keys(receipts).length>=128)throw Object.assign(Error('Background request limit'),{status:429});
  // Brief retries/independent requests need no extra snapshot. 23:30 cutoff is
  // checked by each actual advance, and ordinary scheduled runs are hours apart.
  if(now-p.world.realAt<30000&&p.backgroundTicks?.lastReceipt?.acceptedAt>=now-30000)return {...p.backgroundTicks.lastReceipt,action:'unchanged'};
  const started=Date.now();await advanceCloud(p,engine,now);
  Object.assign(p.files,engine.changes());
  const receipt={worldId:args.worldId,action:'advanced',acceptedAt:now,now:p.world.now,lagMs:Math.max(0,now-p.world.realAt),elapsedMs:Date.now()-started};
  receipts[args.requestId]=receipt;p.backgroundTicks={receipts,lastReceipt:receipt};
  return receipt;
 },false,true,{skipCommit:(result:any)=>['duplicate','unchanged','stale'].includes(result.action)});
}

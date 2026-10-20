import {env} from 'cloudflare:workers';
import {transaction,engine} from './runtime';
import {advanceCloud} from '../bridge/advance.mjs';
import {verifyBackground} from './background-auth.mjs';

export async function backgroundTick(req:Request){
 const now=Date.now(),args=await verifyBackground(req,env,now);
 // The receipt and updated world are committed by the same existing D1 CAS.
 // A failed computation/commit cannot consume a request ID permanently.
 return transaction(async(p:any)=>{
  if(p.world.publicationWorldId!==args.worldId||p.world.speed!==1)throw Object.assign(Error('Background world mismatch'),{status:409});
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
 },false,true,{skipCommit:(result:any)=>result.action==='duplicate'||result.action==='unchanged'});
}

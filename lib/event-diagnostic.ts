import {env} from 'cloudflare:workers';
import {transaction,engine} from './runtime';
import {runEventClock} from '../bridge/event-runtime.mjs';
import {redact} from './maintenance.mjs';
// Explicit owner maintenance. Reproduce only on the uncommitted transaction copy.
// No caller-supplied time, no world snapshot write, no timer reschedule or job claim.
export async function diagnoseEventClock(){
 const at=Date.now();try{return await transaction(async p=>{
  const before={worldTime:p.world.now,planVersion:p.eventPlan?.version};
  try{await runEventClock(p,engine,{real:at,prepare:false});return {at,ok:true,before,wouldAdvanceTo:p.world.now,worldModified:false};}
  catch(e:any){return redact({at,ok:false,before,errorName:e.name,message:e.message,stack:String(e.stack||'').split('\n').slice(0,7).join('\n'),worldModified:false},Object.values(env).filter(v=>typeof v==='string'));}
 },false,false);}catch(e:any){return redact({at,ok:false,errorName:e.name,message:e.message,worldModified:false},Object.values(env).filter(v=>typeof v==='string'));}
}

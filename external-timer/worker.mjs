import {signBackground} from '../lib/background-auth.mjs';
const times=new Set(['09:00','13:30','16:15','23:00','23:30']);
export function isKeyTime(timestamp){
 return times.has(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(timestamp));
}
export async function trigger(env,{fetcher=fetch,now=Date.now(),requestId=crypto.randomUUID()}={}){
 const request=await signBackground(env.TICK_ENDPOINT,env.TICK_SECRET,env.TICK_WORLD_ID,{now,requestId});
 const response=await fetcher(request,{redirect:'manual',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('Background HTTP '+response.status);
 if(Number(response.headers.get('content-length'))>2048)throw Error('Unexpected background receipt');
 const receipt=await response.json();
 if(receipt.worldId!==env.TICK_WORLD_ID||!['advanced','duplicate','unchanged'].includes(receipt.action))throw Error('Unexpected background receipt');
 return receipt;
}
export default {
 async scheduled(controller,env){
  if(!isKeyTime(controller.scheduledTime))return;
  // Sign using execution time; scheduledTime is only used to select the slot.
  const receipt=await trigger(env);
  console.log(JSON.stringify({action:receipt.action,now:receipt.now,lagMs:receipt.lagMs,elapsedMs:receipt.elapsedMs}));
 },
 fetch(){return new Response('Not found',{status:404});}
};

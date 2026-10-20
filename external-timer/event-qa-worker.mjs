import worker,{EventClock} from './event-worker.mjs';
import {verifyBackground} from '../lib/background-auth.mjs';
export class QAEventClock extends EventClock{
 async fetch(req){
  if(new URL(req.url).pathname==='/status'){const response=await super.fetch(req);return Response.json({...await response.json(),qa:await this.ctx.storage.get('qa')});}
  if(new URL(req.url).pathname!=='/qa-receive')return super.fetch(req);
  const args=await req.json(),now=Date.now();let q=await this.ctx.storage.get('qa');
  if(!q){q={events:[{id:'1:prepare',kind:'prepare',version:1,dueAt:now+20000},{id:'1:complete',kind:'transition',version:1,dueAt:now+45000}],receipts:{},calls:[]};}
  if(args.event){if(!q.receipts[args.event.id]){q.receipts[args.event.id]=now;q.calls.push({id:args.event.id,at:now});}q.events=q.events.filter(e=>e.id!==args.event.id);}
  await this.ctx.storage.put('qa',q);
  return Response.json({worldId:this.env.TICK_WORLD_ID,action:args.health?'health':'advanced',architecture:'events-v1',version:1,events:q.events,qaCalls:q.calls});
 }
}
export default {...worker,async fetch(req,env){
 if(new URL(req.url).pathname==='/api/background-tick'){
  try{const args=await verifyBackground(req,{BACKGROUND_TICK_SECRET:env.TICK_SECRET,BACKGROUND_TICK_WORLD_ID:env.TICK_WORLD_ID,BACKGROUND_TICK_ORIGIN:new URL(req.url).origin});return env.EVENT_CLOCK.getByName(env.TICK_WORLD_ID).fetch(new Request('https://qa.internal/qa-receive',{method:'POST',body:JSON.stringify(args)}));}catch{return new Response('Denied',{status:401});}
 }
 return worker.fetch(req,env);
}};

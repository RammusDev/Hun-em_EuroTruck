import {signBackground} from '../lib/background-auth.mjs';
const maxBody=65536;
async function receipt(response){if(!response.ok)throw Error('SITE_HTTP_'+response.status);const bytes=await response.text();if(bytes.length>maxBody)throw Error('RECEIPT_TOO_LARGE');return JSON.parse(bytes);}
export class EventClock {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async call(options){return receipt(await fetch(await signBackground(this.env.TICK_ENDPOINT,this.env.TICK_SECRET,this.env.TICK_WORLD_ID,options),{signal:AbortSignal.timeout(25000),redirect:'manual'}));}
 async saveSchedule(reply,state){
  if(reply.worldId!==this.env.TICK_WORLD_ID||reply.architecture!=='events-v1'||!Number.isSafeInteger(reply.version)||!Array.isArray(reply.events))throw Error('INVALID_SCHEDULE');
  if(reply.version<(state.version||0))throw Error('OLDER_SCHEDULE');
  for(const e of reply.events)if(e.version!==reply.version||typeof e.id!=='string'||!Number.isFinite(e.dueAt))throw Error('INVALID_EVENT');
  const next={version:reply.version,events:reply.events,failures:0,lastSuccess:Date.now(),pending:null};
  const due=next.events.length?Math.min(...next.events.map(e=>e.dueAt)):Date.now()+30*60000;
  await this.ctx.storage.transaction(async tx=>{const current=await tx.get('schedule');if((current?.version||0)>reply.version)return;await tx.put('schedule',next);await tx.setAlarm(Math.max(Date.now()+100,due));});return next;
 }
 async fetch(req){
  if(new URL(req.url).pathname==='/status')return Response.json(await this.ctx.storage.get('schedule')||{});
  if(new URL(req.url).pathname==='/disarm'){await this.ctx.storage.deleteAlarm();const state=await this.ctx.storage.get('schedule')||{};await this.ctx.storage.put('schedule',{...state,disabled:true});return Response.json({disabled:true});}
  // Bootstrap and reconciliation use the same restricted Site machine identity.
  const state=await this.ctx.storage.get('schedule')||{};
  if(state.disabled&&new URL(req.url).pathname==='/health')return Response.json({disabled:true});
  if(state.pending){await this.ctx.storage.setAlarm(Date.now()+100);return Response.json({armed:true,pending:true,version:state.version});}
  const reply=await this.call({health:true});
  if(reply.architecture==='events-v1'&&reply.events?.length){await this.saveSchedule(reply,state);return Response.json({armed:true,version:reply.version,nextAt:Math.min(...reply.events.map(e=>e.dueAt))});}
  const result=await this.call({});await this.saveSchedule(result,state);return Response.json({armed:true,version:result.version});
 }
 async alarm(){
  const state=await this.ctx.storage.get('schedule')||{},now=Date.now();
  const due=state.pending||state.events?.filter(e=>e.dueAt<=now).sort((a,b)=>a.dueAt-b.dueAt)[0];
  if(!due){
   const health=await this.call({health:true});await this.saveSchedule(health,state);return;
  }
  // Persist delivery identity and a recovery alarm BEFORE contacting Sites.
  state.pending=due;state.requestId??=crypto.randomUUID();
  await this.ctx.storage.transaction(async tx=>{await tx.put('schedule',state);await tx.setAlarm(now+60000);});
  try{
   const reply=await this.call({requestId:state.requestId,event:{id:due.id,version:due.version}});
   await this.saveSchedule(reply,state);
  }catch(error){
   state.failures=(state.failures||0)+1;state.lastFailure={at:Date.now(),code:String(error.message).slice(0,100)};
   const delay=Math.min(30*60000,Math.pow(2,Math.min(state.failures,10))*1000);
   await this.ctx.storage.transaction(async tx=>{await tx.put('schedule',state);await tx.setAlarm(Date.now()+delay);});
   console.log(JSON.stringify({action:'event-retry',failures:state.failures,retryInMs:delay}));
  }
 }
}
async function authorize(req,env){
 const stamp=req.headers.get('x-event-time')||'',sig=req.headers.get('x-event-signature')||'';
 if(!/^\d{13}$/.test(stamp)||Math.abs(Date.now()-Number(stamp))>60000||!/^[a-f0-9]{64}$/.test(sig))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.TICK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(sig.match(/../g),v=>parseInt(v,16)),new TextEncoder().encode(['event-control-v1',req.method,new URL(req.url).pathname,stamp].join('\n')));
}
export default {
 async fetch(req,env){const path=new URL(req.url).pathname;if(!['/arm','/status','/disarm'].includes(path)||!await authorize(req,env))return new Response('Denied',{status:401});return env.EVENT_CLOCK.getByName(env.TICK_WORLD_ID).fetch(req);},
 async scheduled(controller,env){
  // Low-frequency reconciliation: read schedule, repair only missing/overdue work.
  const stub=env.EVENT_CLOCK.getByName(env.TICK_WORLD_ID);
  const res=await stub.fetch('https://event.internal/health',{method:'POST'});
  if(!res.ok)throw Error('HEALTH_RECONCILIATION_FAILED');
 }
};

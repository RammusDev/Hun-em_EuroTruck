import {createEventTrace} from './event-trace.mjs';
// Only background/publication transactions settle events. Reads never call this.
export async function prepareEventResearch(p,core,real){
 const deadline=Date.now()+12000;
 const worker=core.createTopicResearcher('/hunem/data',{now:()=>real,research:(anchor,options)=>core.researchAnchor(anchor,{...options,now:real,fetcher:(url,init)=>fetch(url,{...init,signal:AbortSignal.any([init.signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))].filter(Boolean))})})});
 const anchors=core.plannedTopicAnchors(p.world);
 await worker.schedule(p.world,{anchors});p.world.localTopicCache=worker.entries;
 const retry=anchors.map(a=>worker.entries[a.key]).filter(e=>e&&(e.scan?.next<e.scan?.total||e.landmarkStatus==='failed'||e.status==='failed'||e.researchIncomplete||e.foodErrors?.length||e.foodRetryAt<=real)).map(e=>e.retryAt).filter(Number.isFinite);
 p.eventResearch={preparedAt:real,retryAt:retry.length?Math.max(real+60000,Math.min(...retry)):null,anchors:anchors.map(a=>a.key),routeFingerprint:p.world.job?.journey?.routeFingerprint||null};
}
/** @param {any} p @param {any} core @param {{real?:number,prepare?:boolean,beforeShoreChange?:(p:any)=>Promise<void>,trace?:any}} [options] */
export async function runEventClock(p,core,{real=Date.now(),prepare=false,beforeShoreChange,trace=createEventTrace('event-clock')}={}){
 let routed=false;
 const target=p.world.now+Math.max(0,real-p.world.realAt);
 if(p.eventPlan){trace.mark('settle-plan','start');core.settlePlan(p,real);trace.mark('settle-plan','complete');}
 // Catch up only due work; the preview tape itself never publishes or fetches.
 if(!p.eventPlan||target>=p.eventPlan.until){
  // Persist one unknown boundary before attempting any further external work.
  if(p.world.now<target)await trace.span('tick',()=>core.tick(p.world,Math.min(target,(Math.floor(p.world.now/60000)+1)*60000),async job=>{
   routed=true;
   const key=`${job.from}-${job.to}-${job.originPosition?.join(',')||'city'}-cloud-v2`;
   if(p.routes[key]?.verified)return p.routes[key];const r=await trace.span('work-route',()=>core.getRoute(job));if(r.verified)p.routes[key]=r;return r;
  },core.eventRandom(p.world)));
 }
 // Publication cutoffs are independent from whether any movement was due.
 trace.mark('publication-reconcile','start');core.reconcilePublications(p.world,'/hunem/data',real);core.syncTeaching(p.world.diaries);trace.mark('publication-reconcile','complete');
 p.world.realAt=real-(target-p.world.now);
 // Each network preparation has its own budget; they must not accumulate in
 // one response. Saved prepare events resume the remaining work after commit.
 const shore=routed?null:await trace.span('shore-preparation',()=>core.prepareFerryArrival?.(p.world.job,{now:real}));
 if(shore){if(shore.changedRoute)await beforeShoreChange?.(p);p.world.job=shore.job;}
 const researchNeeded=prepare||!p.eventResearch||p.eventResearch.routeFingerprint!==(p.world.job?.journey?.routeFingerprint||null);
 const preparationPending=!!(routed||shore);
 if(researchNeeded&&!preparationPending){await trace.span('topic-research',()=>prepareEventResearch(p,core,real));delete p.eventPreparation;}
 if(preparationPending)p.eventPreparation={dueAt:real+1000};
 trace.mark('plan-input','sample',{worldBytes:Buffer.byteLength(JSON.stringify(p.world)),routePoints:p.world.job?.route?.coords?.length||0,routeLegs:p.world.job?.journey?.legs?.length||0});
 await trace.span('build-plan',()=>rebuildEventPlan(p,core,real));trace.mark('plan-output','sample',{steps:p.eventPlan.steps.length,planBytes:Buffer.byteLength(JSON.stringify(p.eventPlan))});
 return eventSchedule(p);
}
export async function rebuildEventPlan(p,core,real=Date.now()){
 const oldVersion=p.eventPlan?.version||0;
 p.eventPlan=await core.buildEventPlan(p,{maxMinutes:120});
 // A monotonically increasing version also invalidates late external deliveries.
 if(p.eventPlan.version<=oldVersion)throw Error('EVENT_PLAN_VERSION');
 const r=p.eventResearch;
 if(p.eventPreparation){const dueAt=p.eventPreparation.dueAt;p.eventPlan.events.push({id:`${p.eventPlan.version}:preparation:${dueAt}`,version:p.eventPlan.version,kind:'prepare',dueAt,worldAt:dueAt-p.eventPlan.offset});}
 const shoreRetry=p.world.job?.journey?.shoreRetryAt;
 if(shoreRetry>real)p.eventPlan.events.push({id:`${p.eventPlan.version}:shore:${shoreRetry}`,version:p.eventPlan.version,kind:'prepare',dueAt:shoreRetry,worldAt:shoreRetry-p.eventPlan.offset});
 if(r?.retryAt>real&&r.retryAt<real+24*3600000)p.eventPlan.events.push({id:`${p.eventPlan.version}:research:${r.retryAt}`,version:p.eventPlan.version,kind:'prepare',dueAt:r.retryAt,worldAt:r.retryAt-p.eventPlan.offset});
 p.eventPlan.events.sort((a,b)=>a.dueAt-b.dueAt);
 return p.eventPlan;
}
export function eventSchedule(p){return {architecture:'events-v1',version:p.eventPlan?.version||0,events:(p.eventPlan?.events||[]).filter(e=>e.dueAt>p.world.realAt).slice(0,96)};}
export async function notifyEventTimer(endpoint,secret){
 if(!endpoint||!secret)return;
 const url=new URL(endpoint);if(url.protocol!=='https:'||url.pathname!=='/arm'||!url.hostname.endsWith('.workers.dev'))throw Error('INVALID_TIMER_CONTROL');
 const time=String(Date.now()),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(['event-control-v1','POST','/arm',time].join('\n')))).toString('hex');
 const response=await fetch(url,{method:'POST',headers:{'x-event-time':time,'x-event-signature':signature},redirect:'manual',signal:AbortSignal.timeout(4000)});
 if(!response.ok)throw Error('TIMER_CONTROL_HTTP_'+response.status);await response.body?.cancel();
}

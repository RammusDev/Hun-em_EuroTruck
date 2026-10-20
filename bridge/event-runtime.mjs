// Only background/publication transactions settle events. Reads never call this.
export async function prepareEventResearch(p,core,real){
 const deadline=Date.now()+12000;
 const worker=core.createTopicResearcher('/hunem/data',{now:()=>real,research:(anchor,options)=>core.researchAnchor(anchor,{...options,now:real,fetcher:(url,init)=>fetch(url,{...init,signal:AbortSignal.any([init.signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))].filter(Boolean))})})});
 const anchors=core.plannedTopicAnchors(p.world);
 await worker.schedule(p.world,{anchors});p.world.localTopicCache=worker.entries;
 const retry=anchors.map(a=>worker.entries[a.key]).filter(e=>e&&(e.scan?.next<e.scan?.total||e.status==='failed'||e.researchIncomplete||e.foodRetryAt<=real)).map(e=>e.retryAt).filter(Number.isFinite);
 p.eventResearch={preparedAt:real,retryAt:retry.length?Math.max(real+60000,Math.min(...retry)):null,anchors:anchors.map(a=>a.key),routeFingerprint:p.world.job?.journey?.routeFingerprint||null};
}
export async function runEventClock(p,core,{real=Date.now(),prepare=false}={}){
 const target=p.world.now+Math.max(0,real-p.world.realAt);
 if(p.eventPlan)core.settlePlan(p,real);
 // Catch up only due work; the preview tape itself never publishes or fetches.
 if(!p.eventPlan||target>=p.eventPlan.until){
  if(p.world.now<target)await core.tick(p.world,Math.min(target,p.world.now+24*3600000),async job=>{
   const key=`${job.from}-${job.to}-${job.originPosition?.join(',')||'city'}-cloud-v2`;
   if(p.routes[key]?.verified)return p.routes[key];const r=await core.getRoute(job);if(r.verified)p.routes[key]=r;return r;
  },core.eventRandom(p.world));
 }
 // Publication cutoffs are independent from whether any movement was due.
 core.reconcilePublications(p.world,'/hunem/data',real);core.syncTeaching(p.world.diaries);
 p.world.realAt=real-(target-p.world.now);
 if(prepare||!p.eventResearch||p.eventResearch.routeFingerprint!==(p.world.job?.journey?.routeFingerprint||null))await prepareEventResearch(p,core,real);
 const oldVersion=p.eventPlan?.version||0;
 p.eventPlan=await core.buildEventPlan(p);
 // A monotonically increasing version also invalidates late external deliveries.
 if(p.eventPlan.version<=oldVersion)throw Error('EVENT_PLAN_VERSION');
 const r=p.eventResearch;
 if(r?.retryAt>real&&r.retryAt<real+24*3600000)p.eventPlan.events.push({id:`${p.eventPlan.version}:research:${r.retryAt}`,version:p.eventPlan.version,kind:'prepare',dueAt:r.retryAt,worldAt:r.retryAt-p.eventPlan.offset});
 p.eventPlan.events.sort((a,b)=>a.dueAt-b.dueAt);
 return eventSchedule(p);
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

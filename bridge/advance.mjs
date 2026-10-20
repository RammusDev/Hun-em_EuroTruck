// Research actual stops immediately before leisure choices, with bounded I/O.
export async function advanceCloud(payload,core,real=Date.now()){
 const s=payload.world,target=s.now+Math.max(0,real-s.realAt)*s.speed,stop=Math.min(target,s.now+24*3600000);
 const deadline=Date.now()+4000;let queryDeadline=deadline;
 const worker=core.createTopicResearcher('/hunem/data',{research:async(a,options)=>core.researchAnchor(a,{...options,fetcher:(url,init)=>{const left=queryDeadline-Date.now();if(left<=0)throw Error('本次景點查詢時間已用完');return fetch(url,{...init,signal:AbortSignal.any([init.signal,AbortSignal.timeout(left)].filter(Boolean))});}})});s.localTopicCache=worker.entries;let batches=0;
 const due=a=>{const e=worker.entries[a.key];return !e||e.retryAt<=real||e.researchPolicy!==`passenger-v2:${core.topicPolicy.radiusMeters}`;};
 const refresh=async(critical=false)=>{
  // Reserve the second batch and remaining I/O time for the actual outing origin.
  if(batches>=(critical?2:1)||Date.now()>=deadline)return;
  const actual=critical&&core.actualTopicAnchor?.(s),anchors=actual?[actual]:core.plannedTopicAnchors(s);
  if(critical&&!actual)return;
  if(anchors.some(due)){batches++;queryDeadline=critical?deadline:Math.min(deadline,Date.now()+1500);await worker.schedule(s,{anchors});}
 };
 const route=async job=>{const key=`${job.from}-${job.to}-${job.originPosition?.join(',')||'city'}-cloud-v2`;if(payload.routes[key]?.verified)return payload.routes[key];const r=await core.getRoute(job);if(r.verified)payload.routes[key]=r;return r;};
 await refresh();while(s.now<stop){await core.tick(s,Math.min(stop,s.now+3600000),route,undefined,{beforeLeisure:()=>refresh(true)});await refresh();}
 s.realAt=s.speed?real-(target-s.now)/s.speed:real;
 core.reconcilePublications(s,'/hunem/data',real);core.syncTeaching(s.diaries);
}

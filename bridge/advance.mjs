// Bounded real-clock catch-up. Research happens between time slices, before evenings.
export async function advanceCloud(payload,core,real=Date.now()){
 const s=payload.world,target=s.now+Math.max(0,real-s.realAt)*s.speed,stop=Math.min(target,s.now+24*3600000);
 const worker=core.createTopicResearcher('/hunem/data');s.localTopicCache=worker.entries;let batches=0;
 const refresh=async()=>{if(batches>=2)return;const due=core.plannedTopicAnchors(s).some(a=>{const e=worker.entries[a.key];return !e||e.retryAt<=real||e.researchPolicy!==`passenger-v2:${core.topicPolicy.radiusMeters}`;});if(due){await worker.schedule(s);batches++;}};
 const route=async job=>{const key=`${job.from}-${job.to}-${job.originPosition?.join(',')||'city'}-cloud-v2`;if(payload.routes[key]?.verified)return payload.routes[key];const r=await core.getRoute(job);if(r.verified)payload.routes[key]=r;return r;};
 await refresh();while(s.now<stop){await core.tick(s,Math.min(stop,s.now+3600000),route);await refresh();}
 s.realAt=s.speed?real-(target-s.now)/s.speed:real;
 core.reconcilePublications(s,'/hunem/data',real);core.syncTeaching(s.diaries);
}

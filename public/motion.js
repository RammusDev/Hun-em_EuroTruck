// Presentation only: the server remains the authority for work, fuel and money.
// Cache route distances once per snapshot; each frame uses a binary search.
(() => {
 const minute=60000, freshness=20000, clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
 function path(coords){
  const sums=[0],rad=n=>n*Math.PI/180;
  for(let i=1;i<coords.length;i++){
   const a=coords[i-1],b=coords[i],v=Math.sin(rad(b[1]-a[1])/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(rad(b[0]-a[0])/2)**2;
   sums.push(sums.at(-1)+6371*2*Math.asin(Math.sqrt(clamp(v))));
  }
  return fraction=>{
   if(coords.length<2||!sums.at(-1))return coords[0];
   const target=sums.at(-1)*clamp(fraction);let low=1,high=sums.length-1;
   while(low<high){const mid=(low+high)>>1;if(sums[mid]<target)low=mid+1;else high=mid;}
   const span=sums[low]-sums[low-1],f=span?(target-sums[low-1])/span:0;
   return coords[low-1].map((v,k)=>v+(coords[low][k]-v)*f);
  };
 }
 const clock=new Intl.DateTimeFormat('en',{timeZone:'Europe/Berlin',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 function create(s,receivedAt){
  const speed=Math.max(0,Number(s.speed)||0),elapsed=at=>clamp(at-receivedAt,0,freshness)*speed;
  let sample=()=>s.position,active=false;
  const travel=s.travel,outing=s.outing,job=s.job,j=job?.journey;
  if(travel){
   const route=path(travel.route.coords),duration=travel.end-travel.start;
   sample=at=>route((s.now+elapsed(at)-travel.start)/duration);active=s.now<travel.end;
  }else if(outing){
   const origin=outing.origin||s.cities?.find(c=>c.id===outing.location)?.p||s.position,walk=globalThis.HunemWalk.plan(outing,origin);
   sample=at=>walk.sample(s.now+elapsed(at)).position;active=s.now<outing.end;
  }else if(j&&!j.atStop&&!s.operation&&!s.mealPause&&(j.phase==='ferry'||!s.duty?.closed)&&['road','ferry'].includes(j.phase)){
   const leg=j.legs[j.index];
   if(leg?.minutes>0){
    let allowed=leg.minutes-j.legMinutes;
    const carry=clamp(Number(s.journeyCarryMs)||0,0,minute);
    if(j.phase==='road'){
     const parts=Object.fromEntries(clock.formatToParts(s.now).map(p=>[p.type,p.value]));
     const time=+parts.hour*60+(+parts.minute)+(+parts.second)/60;
     if(['Sat','Sun'].includes(parts.weekday)||time<480||time>=960)allowed=0;
     else allowed=Math.min(allowed,240-(s.duty?.driveSince||0),300-(s.duty?.workSince||0),960-time+carry/minute);
    }
    const route=path(leg.coords),timing=globalThis.HunemRouteTiming.compile(leg);
    sample=at=>route(timing.progress(j.legMinutes+clamp((carry+elapsed(at))/minute,0,Math.max(0,allowed))));
    active=allowed>carry/minute;
   }
  }else if(job&&!j&&!s.operation&&!s.mealPause){
   const route=path(job.route.coords),driveMinutes=job.route.km/(job.drivingSpeedKmH||s.movementSpeedsKmH?.driving)*60;
   if(job.segments){
    const offset=(s.now-job.start)/minute;let driven=0;
    for(const seg of job.segments){
     if(seg.type==='driving')driven+=clamp(offset-seg.start,0,seg.end-seg.start);
     if(offset>=seg.start&&offset<seg.end){
      if(seg.type==='driving'){sample=at=>route((driven+Math.min(elapsed(at)/minute,seg.end-offset))/driveMinutes);active=true;}
      break;
     }
    }
   }else{sample=at=>route(((s.now+elapsed(at)-job.start)/minute-30)/driveMinutes);active=s.progress<1;}
  }
  return {position:sample,active:active&&speed>0,expiresAt:receivedAt+freshness};
 }
 globalThis.HunemMotion={create,path};
})();

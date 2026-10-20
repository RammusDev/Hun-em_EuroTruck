// Shared deterministic schematic walk. No network, random draws or visit events.
(() => {
 function plan(outing,origin){
  if(outing.tourVersion){
   if(outing.phase==='visit')return plan({...outing,tourVersion:0,transportMode:'walking',roundTripWalkingMinutes:0},outing.place.p);
   const to=outing.place.p,waitEnd=outing.start+(outing.waitMinutes||0)*60000,moving=['outbound','return'].includes(outing.phase);
   const legs=moving?[{start:outing.start,end:waitEnd,from:origin,to:origin,kind:'waiting'},{start:waitEnd,end:outing.end,from:origin,to,kind:outing.phase}]:[{start:outing.start,end:outing.end,from:to,to,kind:outing.phase}];
   return {points:[origin,to],legs,arrive:outing.end,returnAt:outing.end,simulated:true,sample(now){const leg=legs.find(l=>now<l.end)||legs.at(-1),t=Math.max(0,Math.min(1,(now-leg.start)/Math.max(1,leg.end-leg.start)));return {position:leg.from.map((v,k)=>v+(leg.to[k]-v)*t),kind:leg.kind};}};
  }
  const destination=outing.place.p,duration=outing.end-outing.start;
  const walk=outing.roundTripWalkingMinutes!==undefined?Math.min(.49,outing.roundTripWalkingMinutes/2/(duration/60000)):outing.place.walkingMinutes?Math.min(.45,outing.place.walkingMinutes/2/(duration/60000)):.22;
  const transfer=outing.transportMode==='passenger'?outing.transportMinutesEachWay*60000:duration*walk;
  const arrive=outing.start+transfer,returnAt=outing.end-transfer;
  let seed=2166136261;
  for(const c of `${outing.start}:${outing.location}:${outing.place.name}`)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
  const angle=seed/4294967296*Math.PI*2,speed=outing.walkingSpeedKmH;
  let radius=Math.min(50,Math.max(8,(returnAt-arrive)/60000*1.2)),circuits=returnAt-arrive>=30*60000?2:1;
  if(speed>0){const loopMs=radius*(2+3*Math.SQRT2)/(speed*1000)*3600000,budget=(returnAt-arrive)*.75;circuits=Math.max(1,Math.min(100,Math.floor(budget/loopMs)));if(loopMs>budget)radius*=budget/loopMs;}
  const nodes=[destination];
  for(let lap=0;lap<circuits;lap++){
   for(let i=0;i<4;i++){
    const theta=angle+i*Math.PI/2,r=radius*(.75+((seed>>>(i*4))&15)/60);
    nodes.push([destination[0]+Math.cos(theta)*r/(111320*Math.max(.2,Math.cos(destination[1]*Math.PI/180))),destination[1]+Math.sin(theta)*r/111320]);
   }
   nodes.push(destination);
  }
  const legs=[{start:outing.start,end:arrive,from:origin,to:destination,kind:'outbound'}],slot=(returnAt-arrive)/(nodes.length-1);
  const moving=nodes.slice(1).map((p,i)=>Math.hypot((p[0]-nodes[i][0])*111320*Math.cos(destination[1]*Math.PI/180),(p[1]-nodes[i][1])*111320)/(speed*1000)*3600000);
  const pauseMs=speed>0?Math.max(0,(returnAt-arrive-moving.reduce((a,b)=>a+b,0))/(nodes.length-1)):0;
  let cursor=arrive;
  for(let i=1;i<nodes.length;i++){
   const start=speed>0?cursor:arrive+(i-1)*slot,pause=speed>0?start+moving[i-1]:start+slot*.75,end=speed>0?(i===nodes.length-1?returnAt:pause+pauseMs):arrive+i*slot;cursor=end;
   legs.push({start,end:pause,from:nodes[i-1],to:nodes[i],kind:'wander'},{start:pause,end,from:nodes[i],to:nodes[i],kind:'pause'});
  }
  legs.push({start:returnAt,end:outing.end,from:destination,to:origin,kind:'return'});
  function sample(now){
   if(now>=outing.end)return {position:origin,kind:'done'};
   const leg=legs.find(l=>now<l.end)||legs.at(-1),t=Math.max(0,Math.min(1,(now-leg.start)/(leg.end-leg.start)));
   return {position:leg.from.map((n,k)=>n+(leg.to[k]-n)*t),kind:leg.kind};
  }
  return {sample,points:[origin,...nodes,origin],legs,arrive,returnAt,simulated:true};
 }
 globalThis.HunemWalk={plan};
})();

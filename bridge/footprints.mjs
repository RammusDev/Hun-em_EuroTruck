// Read-only projection. Never enters the minute-by-minute event planner.
import {createHash} from 'node:crypto';
export const footprintId=(world,id)=>createHash('sha256').update(world+'\n'+id).digest('hex').slice(0,32);
export const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
export function footprintInventory(payload,now=Date.now()){
 const world=payload.world, found=new Map(), seen=new Set();
 const add=e=>{
  if(e.type!=='visit'||e.place?.generic||!Number.isFinite(e.time)||e.time>now)return;
  const p=e.place||{},topic=p.topicId||p.id;if(!topic)return;
  const key=String(topic),id=footprintId(world.publicationWorldId,key),eventKey=id+':'+e.time;
  if(seen.has(eventKey))return;seen.add(eventKey);
  let row=found.get(id);
  if(!row){row={id,topicId:key,name:p.name||key,cityId:e.location||null,p:validPoint(p.p)?[...p.p]:null,source:p.source||null,visits:[]};found.set(id,row);}
  if(!row.p&&validPoint(p.p))row.p=[...p.p];
  row.visits.push(e.time);
 };
 for(const e of world.events||[])add(e);
 for(const job of world.publicationJobs||[])for(const e of job.input?.events||[])add(e);
 // Older compact history can still supply exact first/last times. Never invent a time from a date.
 for(const v of Object.values(world.visits?.landmarks||{})){
  const id=footprintId(world.publicationWorldId,String(v.topicId||v.id));
  if(!found.has(id))for(const time of new Set([v.firstSeenAt,v.lastSeenAt]))add({type:'visit',time,location:v.town,place:{topicId:v.topicId||v.id,name:v.name,source:v.source}});
 }
 return [...found.values()].map(r=>({...r,visits:r.visits.sort((a,b)=>b-a),firstSeenAt:Math.min(...r.visits),lastSeenAt:Math.max(...r.visits)})).sort((a,b)=>b.lastSeenAt-a.lastSeenAt||a.id.localeCompare(b.id));
}
export function mapFootprints(rows,{west,south,east,north,zoom=8}){
 if(![west,south,east,north,zoom].every(Number.isFinite)||south>north||south< -90||north>90||Math.abs(west)>180||Math.abs(east)>180)throw Error('INVALID_BOUNDS');
 const visible=rows.filter(r=>validPoint(r.p)&&r.p[1]>=south&&r.p[1]<=north&&(west<=east?r.p[0]>=west&&r.p[0]<=east:r.p[0]>=west||r.p[0]<=east));
 const pixel=p=>{const lat=Math.max(-85,Math.min(85,p[1]))*Math.PI/180;return [(p[0]+180)/360,(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2];};
 let cell=64,groups;
 do{const bins=new Map(),scale=256*2**Math.max(0,Math.min(20,zoom));
  for(const r of visible){const p=pixel(r.p),k=Math.floor(p[0]*scale/cell)+','+Math.floor(p[1]*scale/cell);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(r);}
  groups=[...bins.values()];cell*=2;
 }while(groups.length>100);
 return groups.map(g=>g.length===1?{...g[0],visits:undefined,count:1}:{id:'cluster:'+g[0].id,count:g.length,p:g[0].p,name:`${g.length} 個旅行足跡`});
}

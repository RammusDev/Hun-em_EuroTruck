// Two stages only: committed selection -> private artwork; completed fact -> release.
import {collectionInventory} from './collections.mjs';
import {footprintInventory} from './footprints.mjs';
import {verifyCollectionArtifacts} from './collection-artifacts.mjs';
import {repairSketchSubject} from './sketch-repairs.mjs';

export const sketchKinds=['meal','soda','footprint'];
export const sketchKey=(kind,id)=>kind==='footprint'?'footprint:'+id:'collection:'+kind+':'+id;
const selectionPrefix=kind=>'sketch-selection:'+kind+':';
const history=p=>[...(p.world.events||[]),...(p.world.publicationJobs||[]).flatMap(j=>j.input?.events||[])];
const project=(p,events)=>({...p,world:{...p.world,events,publicationJobs:[],visits:{landmarks:{}}}});
const inventory=(p,kind,now)=>kind==='footprint'?footprintInventory(p,now):collectionInventory(p,kind,now);

// Only the saved private settlement tape, never research candidates or public patches.
export function selectedSketches(p,kind,now=Date.now()){
 const choices=new Map();
 const add=e=>{
  if(kind==='footprint'?e.type!=='visit'||e.time<=p.world.now:e.type!=='expense'||e.category!==kind)return;
  const key=e.id||[e.type,e.time,e.place?.topicId,e.place?.id,e.food?.name,e.soda?.id].join(':');choices.set(key,e);
 };
 if(kind!=='footprint')for(const e of history(p))if(e.time<=Math.min(now,p.world.now))add(e);
 for(const step of p.eventPlan?.steps||[])for(const [keys,put,value] of step.patch||[]){
  if(!put||keys[0]!=='events')continue;
  if(keys.length===1&&Array.isArray(value))for(const e of value)add(e);
  else if(keys.length===2&&value?.type)add(value);
 }
 const selected=[...choices.values()];
 if(kind==='footprint'&&p.world.outing?.place&&(!p.world.outing.tourVersion||['outbound','visit'].includes(p.world.outing.phase))){const o=p.world.outing;selected.push({type:'visit',time:o.end,location:o.location,place:o.place});}
 const synthetic=kind==='meal'?selected.map(e=>({...e,type:'meal_finished',mealId:e.id,meal:e.food?.meal,location:e.location||e.food?.cityId||e.food?.location})):selected;
 const rows=inventory(project(p,synthetic),kind,Infinity),chosenAt=p.eventPlan?.createdAt??p.world.realAt??now;
 return rows.map(row=>({...row,selectedAt:row.lastSeenAt>p.world.now?chosenAt:row.lastSeenAt,selectionToken:kind==='footprint'?String(row.lastSeenAt):row.occurrences[0].key,selectionOnly:true}));
}

export function completedSketches(p,kind,now=Date.now()){
 const at=Math.min(now,p.world.now),rows=inventory(p,kind,at);
 if(kind!=='soda')return rows;
 // Match the bottle, not just its brand: a purchase is never proof of drinking.
 const finished=new Map(history(p).filter(e=>e.type==='soda_finished'&&e.time<=at&&e.purchaseId).map(e=>[String(e.purchaseId),e.time]));
 return rows.flatMap(row=>{
  const occurrences=row.occurrences.filter(o=>finished.has(o.key.slice('soda:'.length))).map(o=>({...o,completedAt:finished.get(o.key.slice('soda:'.length))}));
  return occurrences.length?[{...row,occurrences,count:occurrences.length,firstSeenAt:Math.min(...occurrences.map(o=>o.time)),lastSeenAt:Math.max(...occurrences.map(o=>o.time))}]:[];
 });
}

const records=async(db,prefix)=>(await db.prepare('SELECT id,value FROM hunem_runtime WHERE id LIKE ?').bind(prefix+'%').all()).results||[];
export async function registerSketchSelections(db,p,now=Date.now(),onlyKind=null){
 // A renewed forecast of the same occurrence never moves its watermark.
 for(const kind of onlyKind?[onlyKind]:sketchKinds){
  const known=new Map((await records(db,selectionPrefix(kind))).map(r=>[r.id,r.value]));
  for(const row of selectedSketches(p,kind,now)){
   const key=selectionPrefix(kind)+row.id,old=known.get(key),previous=old?JSON.parse(old):null;
   if(previous&&(previous.selectionToken===row.selectionToken||previous.selectedAt>=row.selectedAt))continue;
   const value=JSON.stringify({...row,worldId:p.world.publicationWorldId});
   if(old)await db.prepare('UPDATE hunem_runtime SET value=?,revision=revision+1,updated_at=? WHERE id=? AND value=?').bind(value,now,key,old).run();
   else await db.prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(key,value,now).run();
  }
 }
}

// Owner-only work projection. Reads do not register, publish, or advance anything.
export async function drawingSketches(db,p,kind,now=Date.now()){
 const selected=new Map(selectedSketches(p,kind,now).map(r=>[r.id,r])),completed=new Map(completedSketches(p,kind,now).map(r=>[r.id,r]));
 const stored=new Map((await records(db,selectionPrefix(kind))).map(r=>[r.id.slice(selectionPrefix(kind).length),JSON.parse(r.value)]));
 // Completed rows without a selection record remain available for explicit owner repair,
 // but event delivery below requires a recorded selection and cannot trigger on completion.
 return [...new Set([...selected.keys(),...completed.keys()])].map(id=>repairSketchSubject({...stored.get(id),...(selected.get(id)||completed.get(id)),selectedAt:stored.get(id)?.selectedAt??selected.get(id)?.selectedAt??null,selectionRecorded:stored.has(id),activityCompleted:completed.has(id)},kind,p.world.publicationWorldId));
}

export function sketchIsPublic(image){return !!image&&(image.sketchVersion!==2||Number.isFinite(image.publishedAt));}

export async function sketchSelectionState(db,p,kind,now=Date.now()){
 const active=new Set(selectedSketches(p,kind,now).map(r=>r.id)),complete=new Set(completedSketches(p,kind,now).map(r=>r.id));
 const images=new Map((await records(db,kind==='footprint'?'footprint:':'collection:'+kind+':')).map(r=>[r.id.split(':').at(-1),JSON.parse(r.value)]));
 return (await records(db,selectionPrefix(kind))).map(r=>repairSketchSubject(JSON.parse(r.value),kind,p.world.publicationWorldId)).filter(r=>r.worldId===p.world.publicationWorldId).map(r=>{
  const image=images.get(r.id),cancelled=!active.has(r.id)&&!complete.has(r.id);
  return {id:r.id,name:r.name,state:cancelled?'cancelled':image?sketchIsPublic(image)?'published':complete.has(r.id)?'awaiting_release':'private_ready':complete.has(r.id)?'completed_waiting_art':'selected_waiting_art'};
 });
}

/** @param {{db:any,bucket:any,p:any,now?:number,onlyKind?:string,onlyId?:string}} options */
export async function publishCompletedSketches({db,bucket,p,now=Date.now(),onlyKind,onlyId}){
 let published=0;
 for(const kind of onlyKind?[onlyKind]:sketchKinds){
  for(const row of completedSketches(p,kind,now)){
   if(onlyId&&onlyId!==row.id)continue;
   const key=sketchKey(kind,row.id),record=await db.prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(key).first();
   if(!record)continue;const image=JSON.parse(record.value);
   if(image.sketchVersion!==2||Number.isFinite(image.publishedAt))continue;
   await verifyCollectionArtifacts(bucket,image);
   const completedAt=kind==='footprint'?row.firstSeenAt:Math.min(...row.occurrences.map(o=>o.completedAt??o.time));
   const released={...image,publishedAt:now,completedAt};
   const r=await db.prepare('UPDATE hunem_runtime SET value=?,revision=revision+1,updated_at=? WHERE id=? AND value=?').bind(JSON.stringify(released),now,key,record.value).run();
   published+=r.meta.changes||0;
  }
 }
 return {published};
}

import {recordSketchStep,sketchFailureCodes} from './sketch-progress.mjs';
import {drawingSketches} from './sketch-lifecycle.mjs';
export const completionGraceMs=30*60000;
export const collectionFailureCodes=sketchFailureCodes;
export function collectionCompletionService({db,kind,now=Date.now,reference=async()=>({ready:true,errors:[]})}){
 const footprint=kind==='footprint',prefix=footprint?'footprint-event:':'collection-event:'+kind+':',failureKey=id=>'collection-failure:'+kind+':'+id;
 const imagePrefix=footprint?'footprint:':'collection:'+kind+':',claimPrefix=footprint?'footprint-claim:':'collection-claim:'+kind+':';
 const eventSubject=e=>footprint?e.footprintId:e.collectionId;
 const all=async p=>(await db.prepare('SELECT id,value,lease,lease_until FROM hunem_runtime WHERE id LIKE ?').bind(p+'%').all()).results.map(r=>({key:r.id,...JSON.parse(r.value),lease:r.lease,lease_until:r.lease_until}));
 const get=async id=>{const r=await db.prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(id).first();return r?JSON.parse(r.value):null;};
 const eligible=async(p,activeOnly=false)=>{
  const subs=await all(footprint?'mcp-event-sub:':'collection-event-sub:'+kind+':');
  return (await drawingSketches(db,p,kind,now())).filter(r=>r.selectionRecorded&&(footprint||r.sketchEligible)&&subs.some(s=>s.enabled&&(!activeOnly||s.expiresAt>now())&&s.worldId===p.world.publicationWorldId&&r.selectedAt>=s.createdAt));
 };
 async function state(p){
  const [rows,receipts,images,claims,progress]=await Promise.all([eligible(p),all(prefix),all(imagePrefix),all(claimPrefix),all('sketch-progress:'+kind+':')]);
  const saved=new Map(images.map(r=>[r.key.slice(imagePrefix.length),r])),out=[];
  for(const row of rows){
   const events=receipts.filter(e=>eventSubject(e)===row.id).sort((a,b)=>(b.at||0)-(a.at||0)),event=events.find(e=>e.status==='sent')||events[0],observed=progress.find(r=>r.key.endsWith(':'+row.id)),claim=claims.find(c=>c.key.endsWith(':'+row.id)),drawing=!!claim?.lease&&claim.lease_until>now();
   if(saved.has(row.id)){const image=saved.get(row.id),privateReady=image.sketchVersion===2&&!Number.isFinite(image.publishedAt);out.push({id:row.id,name:row.name,state:privateReady&&row.activityCompleted?'awaiting_release':'complete',publication:privateReady?'private-ready':'published',activityCompleted:row.activityCompleted,overdue:privateReady&&row.activityCompleted,verification:image.verifiedAt?'verified-at-save':'legacy-image-record',taskStartedAt:claim?.startedAt||null,stage:'saved',observations:observed?{steps:observed.steps,counts:observed.counts}:null,usage:{tokens:null,imageGenerations:null,reason:'Platform usage unavailable'}});continue;}
   const ref=await reference(row),failure=await get(failureKey(row.id)),dueAt=event?.completionDueAt||((event?.at||row.firstSeenAt)+completionGraceMs);
   const observedFailure=observed?.stage==='failed'?observed.steps?.at(-1):null;
   const latestFailure=observedFailure&&(!failure||observedFailure.at>failure.at)?observedFailure:failure;
   const activeFailure=latestFailure&&latestFailure.at>=(claim?.startedAt||0)?latestFailure:null;
   const needsAttention=event?.status==='stopped'||event?.status==='suppressed'||!!activeFailure||!drawing&&(event?.status==='sent'&&now()>=dueAt||!!claim?.startedAt);
   out.push({id:row.id,name:row.name,state:drawing&&!activeFailure?'drawing':['REFERENCE_UNAVAILABLE','PACKAGING_UNCONFIRMED'].includes(activeFailure?.code)?'reference_blocked':needsAttention?'attention_required':event?.status==='sent'?'awaiting_image':'awaiting_notification',deliveryState:event?.status||'not_sent',automaticRetries:event?.automaticRetries||0,automaticReplayEnabled:false,nextCheckAt:drawing?claim.lease_until:null,overdue:needsAttention||event?.status==='sent'&&now()>=dueAt,referenceCached:ref.ready,lastError:event?.status==='stopped'?'NOTIFICATION_DELIVERY_STOPPED':activeFailure?.code||(needsAttention?(claim?.startedAt?'CLAIM_EXPIRED_WITHOUT_IMAGE':'TASK_START_OR_COMPLETION_NOT_REPORTED'):null),failureAt:activeFailure?.at||null,taskStartedAt:claim?.startedAt||null,stage:observed?.stage||(claim?.startedAt?'claimed':event?.status==='sent'?'notification_accepted':'not_started'),observations:observed?{steps:observed.steps,counts:observed.counts}:null,usage:{tokens:null,imageGenerations:null,reason:'Platform usage unavailable; tool observations are not model request counts'}});
  }
  return {automaticReplayEnabled:false,total:out.length,complete:out.filter(r=>r.state==='complete').length,pending:out.filter(r=>r.state!=='complete').length,blocked:out.filter(r=>r.state==='reference_blocked'||r.state==='attention_required').length,items:out};
 }
 async function reconcile(p,onlyId){
  // Missing artwork is not proof of a retryable failure. Never wake AI on silence.
  return {requeued:0,automaticReplayEnabled:false};
 }
 async function failure(p,id,code){
  if(!collectionFailureCodes.includes(code)||!(await drawingSketches(db,p,kind,now())).some(r=>r.id===id&&(footprint||r.sketchEligible)))throw Error('INVALID_COLLECTION_FAILURE');
  if(await get(imagePrefix+id))return {kind,id,state:'complete',worldModified:false};
  const record={kind,id,code,at:now()};await db.prepare('INSERT INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,revision=revision+1,updated_at=excluded.updated_at').bind(failureKey(id),JSON.stringify(record),now()).run();
  await recordSketchStep(db,kind,id,'failed',{now:now(),code});
  return {...record,state:'attention_required',automaticReplayEnabled:false,worldModified:false};
 }
 return {state,reconcile,failure};
}

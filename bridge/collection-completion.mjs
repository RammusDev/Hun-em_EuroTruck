import {randomUUID} from 'node:crypto';
import {drawingSketches} from './sketch-lifecycle.mjs';
export const completionGraceMs=30*60000;
export const collectionFailureCodes=['REFERENCE_UNAVAILABLE','PACKAGING_UNCONFIRMED','IMAGE_GENERATION_FAILED','IMAGE_VALIDATION_FAILED','IMAGE_SAVE_FAILED'];
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
  const [rows,receipts,images,claims]=await Promise.all([eligible(p),all(prefix),all(imagePrefix),all(claimPrefix)]);
  const saved=new Map(images.map(r=>[r.key.slice(imagePrefix.length),r])),out=[];
  for(const row of rows){
   const events=receipts.filter(e=>eventSubject(e)===row.id),event=events.sort((a,b)=>(b.at||0)-(a.at||0))[0],claim=claims.find(c=>c.key.endsWith(':'+row.id)),drawing=!!claim?.lease&&claim.lease_until>now();
   if(saved.has(row.id)){const image=saved.get(row.id),privateReady=image.sketchVersion===2&&!Number.isFinite(image.publishedAt);out.push({id:row.id,name:row.name,state:privateReady&&row.activityCompleted?'awaiting_release':'complete',publication:privateReady?'private-ready':'published',activityCompleted:row.activityCompleted,overdue:privateReady&&row.activityCompleted,verification:image.verifiedAt?'verified-at-save':'legacy-image-record'});continue;}
   const ref=await reference(row),failure=await get(failureKey(row.id)),dueAt=event?.completionDueAt||((event?.at||row.firstSeenAt)+completionGraceMs),exhausted=event?.status==='stopped'||(event?.automaticRetries||0)>=3&&now()>=dueAt;
   out.push({id:row.id,name:row.name,state:drawing?'drawing':exhausted?'attention_required':['REFERENCE_UNAVAILABLE','PACKAGING_UNCONFIRMED'].includes(failure?.code)?'reference_blocked':event?.status==='sent'?'awaiting_image':'awaiting_notification',deliveryState:event?.status||'not_sent',automaticRetries:event?.automaticRetries||0,nextCheckAt:drawing?claim.lease_until:exhausted?null:dueAt,overdue:event?.status==='stopped'||now()>=(event?.firstAcceptedAt?event.firstAcceptedAt+completionGraceMs:dueAt),referenceCached:ref.ready,lastError:event?.status==='stopped'?'NOTIFICATION_DELIVERY_STOPPED':failure?.code||((event?.status==='sent'&&now()>=dueAt)?'IMAGE_COMPLETION_NOT_REPORTED':null),failureAt:failure?.at||null});
  }
  return {total:out.length,complete:out.filter(r=>r.state==='complete').length,pending:out.filter(r=>r.state!=='complete').length,blocked:out.filter(r=>r.state==='reference_blocked'||r.state==='attention_required').length,items:out};
 }
 async function reconcile(p,onlyId){
  const rows=new Map((await eligible(p,true)).filter(r=>!onlyId||r.id===onlyId).map(r=>[r.id,r]));let requeued=0;
  for(const event of (await all(prefix)).filter(e=>e.status==='sent')){
   if(requeued>=2)break;const row=rows.get(eventSubject(event));if(!row)continue;
   const due=e=>e.completionDueAt||e.at+completionGraceMs;
   if((event.automaticRetries||0)>=3||now()<due(event)||await get(imagePrefix+row.id))continue;
   const lease=randomUUID(),locked=await db.prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING value').bind(lease,now()+30000,event.key,now()).first();if(!locked)continue;
   try{
    const saved=JSON.parse(locked.value),claim=await db.prepare('SELECT lease,lease_until FROM hunem_runtime WHERE id=?').bind(claimPrefix+row.id).first();
    if(saved.status!=='sent'||now()<due(saved)||(saved.automaticRetries||0)>=3||claim?.lease&&claim.lease_until>now()||await get(imagePrefix+row.id))continue;
    const next={...saved,status:'pending',attempts:0,nextAt:0,generation:(saved.generation||0)+1,automaticRetries:(saved.automaticRetries||0)+1,lastCompletionCheckAt:now()};
    await db.prepare('UPDATE hunem_runtime SET value=?,revision=revision+1,updated_at=? WHERE id=? AND lease=?').bind(JSON.stringify(next),now(),event.key,lease).run();requeued++;
   }finally{await db.prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(event.key,lease).run();}
  }
  return {requeued};
 }
 async function failure(p,id,code){
  if(!collectionFailureCodes.includes(code)||!(await drawingSketches(db,p,kind,now())).some(r=>r.id===id&&r.sketchEligible))throw Error('INVALID_COLLECTION_FAILURE');
  if(await get('collection:'+kind+':'+id))return {kind,id,state:'complete',worldModified:false};
  const record={kind,id,code,at:now()};await db.prepare('INSERT INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,revision=revision+1,updated_at=excluded.updated_at').bind(failureKey(id),JSON.stringify(record),now()).run();
  return {...record,state:'pending',worldModified:false};
 }
 return {state,reconcile,failure};
}

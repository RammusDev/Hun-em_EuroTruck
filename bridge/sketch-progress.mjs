import {activateQueuedSketch} from './sketch-work.mjs';
export {activateQueuedSketch};
// Observed tool steps only. No inference of model usage or renderer success.
export const sketchStages=['reference_ready','image_generated'];
export const sketchFailureCodes=['REFERENCE_UNAVAILABLE','PACKAGING_UNCONFIRMED','IMAGE_GENERATION_FAILED','IMAGE_VALIDATION_FAILED','IMAGE_SAVE_FAILED','RATE_LIMITED','TASK_INTERRUPTED','FILE_TRANSFER_FAILED','CLAIM_EXPIRED'];
/** @param {any} db @param {string} kind @param {string} id @param {string} stage @param {{now?:number,code?:string|null,bytes?:number|null}} options */
export async function recordSketchStep(db,kind,id,stage,{now=Date.now(),code=null,bytes=null}={}){
 if(!['meal','soda','footprint'].includes(kind)||!/^[a-f0-9]{32}$/.test(id)||!['claimed','reference_ready','image_generated','file_receiving','file_received','receiving','saved','failed'].includes(stage))throw Error('INVALID_SKETCH_PROGRESS');
 const key=`sketch-progress:${kind}:${id}`;
 const event={stage,at:now,...(code?{code}:{}),...(Number.isSafeInteger(bytes)?{bytes}:{})};
 // Atomic bounded history and counters: concurrent steps cannot overwrite each other.
 await db.prepare(`INSERT INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)
 ON CONFLICT(id) DO UPDATE SET value=json_set(hunem_runtime.value,
 '$.stage',json_extract(excluded.value,'$.stage'),'$.at',excluded.updated_at,
 '$.steps',json((SELECT json_group_array(json(value)) FROM (SELECT key,value FROM (SELECT key,value FROM json_each(json_insert(hunem_runtime.value,'$.steps[#]',json(?)),'$.steps') ORDER BY CAST(key AS INTEGER) DESC LIMIT 12) ORDER BY CAST(key AS INTEGER)))),
 '$.counts.${stage}',COALESCE(json_extract(hunem_runtime.value,'$.counts.${stage}'),0)+1),revision=revision+1,updated_at=excluded.updated_at`)
 .bind(key,JSON.stringify({stage,at:now,steps:[event],counts:{[stage]:1}}),now,JSON.stringify(event)).run();
}
export async function observeSketchReceive({db,kind,id,lease},read,save){
 const claimKey=kind==='footprint'?'footprint-claim:'+id:`collection-claim:${kind}:${id}`;
 const imageKey=kind==='footprint'?'footprint:'+id:`collection:${kind}:${id}`;
 // Completed saves remain byte-idempotent after the lease is released.
 const image=await db.prepare('SELECT id FROM hunem_runtime WHERE id=?').bind(imageKey).first();
 if(!image)await activateQueuedSketch(db,kind,id,lease);
 const claim=await db.prepare('SELECT lease,lease_until FROM hunem_runtime WHERE id=?').bind(claimKey).first();
 const active=!!lease&&claim?.lease===lease&&claim.lease_until>Date.now();
 if(!image&&!active)throw Error('SKETCH_CLAIM_REQUIRED');
 let phase='file_receiving';
 try{
  if(active)await recordSketchStep(db,kind,id,phase);
  const {bytes}=await read();phase='file_received';
  if(active)await recordSketchStep(db,kind,id,phase,{bytes:bytes.length});
  return await save(bytes);
 }catch(error){
  if(active&&!image){
   const message=String(error?.message||'');
   const code=phase==='file_receiving'?'FILE_TRANSFER_FAILED':/CLAIM_REQUIRED/.test(message)?'CLAIM_EXPIRED':/PNG|TRANSPARENT|SQUARE|REVIEW_REQUIRED/.test(message)?'IMAGE_VALIDATION_FAILED':'IMAGE_SAVE_FAILED';
   try{
    // Cleanup/release may throw after D1 committed the artwork. Never call that a lost image.
    const persisted=await db.prepare('SELECT id FROM hunem_runtime WHERE id=?').bind(imageKey).first();
    if(!persisted)await recordSketchStep(db,kind,id,'failed',{code});
   }catch{console.log('sketch-receive-failure-record-pending');}
  }
  throw error;
 }
}
export async function reportSketchProgress({db,kind,id,lease,stage,now=Date.now()}){
 if(!['meal','soda','footprint'].includes(kind)||!/^[a-f0-9]{32}$/.test(id)||!sketchStages.includes(stage))throw Error('INVALID_SKETCH_PROGRESS');
 const key=kind==='footprint'?'footprint-claim:'+id:`collection-claim:${kind}:${id}`;
 const claim=await db.prepare('SELECT lease,lease_until FROM hunem_runtime WHERE id=?').bind(key).first();
 if(!lease||claim?.lease!==lease||claim.lease_until<=now)throw Error('SKETCH_CLAIM_REQUIRED');
 await recordSketchStep(db,kind,id,stage,{now});return {kind,id,stage,observedAt:now,usage:null};
}
export async function dispatchSketch({db,kind,id,now,manual=false,requestId=null},send){
 const key=`sketch-dispatch:${kind}:${id}`,lease=crypto.randomUUID();
 await db.prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(key,'{}',now).run();
 if(!await db.prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING id').bind(lease,now+30000,key,now).first())return null;
 try{
  const previous=await db.prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(key).first();
  const acceptedRequests=JSON.parse(previous.value).acceptedRequests||[];
  if(manual&&requestId&&acceptedRequests.includes(requestId))return false;
  const image=kind==='footprint'?'footprint:'+id:`collection:${kind}:${id}`,claimKey=kind==='footprint'?'footprint-claim:'+id:`collection-claim:${kind}:${id}`;
  if(await db.prepare('SELECT id FROM hunem_runtime WHERE id=?').bind(image).first())return false;
  const claim=await db.prepare('SELECT value,lease,lease_until FROM hunem_runtime WHERE id=?').bind(claimKey).first();
  if(claim?.lease&&claim.lease_until>now||!manual&&claim&&JSON.parse(claim.value).startedAt)return false;
  if(!manual&&await db.prepare('SELECT id FROM hunem_runtime WHERE id=?').bind(`sketch-progress:${kind}:${id}`).first())return false;
  if(!manual){
   const prefix=kind==='footprint'?'footprint-event:':`collection-event:${kind}:`;
   const events=await db.prepare('SELECT value FROM hunem_runtime WHERE id LIKE ?').bind(prefix+'%').all();
   if(events.results.some(r=>{const e=JSON.parse(r.value);return (e.footprintId||e.collectionId)===id&&e.status==='sent';}))return false;
  }
  const accepted=await send();
  if(accepted&&manual&&requestId)await db.prepare('UPDATE hunem_runtime SET value=?,revision=revision+1,updated_at=? WHERE id=? AND lease=?').bind(JSON.stringify({acceptedRequests:[...acceptedRequests,requestId].slice(-10)}),now,key,lease).run();
  return true;
 }finally{await db.prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(key,lease).run();}
}

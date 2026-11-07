import {randomUUID} from 'node:crypto';
import {mealReferenceCache} from './meal-reference-cache.mjs';
import {sodaReferenceCache,sodaPackageReference} from './soda-reference.mjs';
import {footprintReferenceCache} from './footprint-reference.mjs';
// Deterministic work preparation. The model receives one subject, not world history.
export const sketchClaimKey=(kind,id)=>kind==='footprint'?'footprint-claim:'+id:`collection-claim:${kind}:${id}`;
// Called inside the item dispatch lock, before sending a webhook. Waiting for the
// executor does not consume a drawing lease. The owner-only receive activates it.
export const sketchReferenceCache=({bucket,kind,now=Date.now})=>kind==='footprint'?footprintReferenceCache({bucket,now}):kind==='soda'?sodaReferenceCache({bucket,now}):mealReferenceCache({bucket,now});
export async function ensureSketchReference({bucket,kind,row,now=Date.now()}){
 try{
  const cache=sketchReferenceCache({bucket,kind,now:()=>now});
  if(await cache.shouldPrepare(row.id))await cache.prepare(row);
  return await cache.read(row.id);
 }catch{return {photos:[],errors:['REFERENCE_PREPARATION_FAILED']};}
}
export async function readSketchReference({bucket,kind,id}){
 if(!sketchKinds.includes(kind)||!/^[a-f0-9]{32}$/.test(id))throw Error('INVALID_SKETCH');
 const refs=await sketchReferenceCache({bucket,kind}).read(id);
 return {content:[{type:'text',text:JSON.stringify({action:refs.photos.length?'reference_ready':'reference_pending',kind,id,errors:refs.errors,references:refs.photos.map(({bytes,...photo})=>photo)})},...refs.photos.map(p=>({type:'image',mimeType:p.mimeType,data:Buffer.from(p.bytes).toString('base64')}))],isError:false};
}
export async function queueSketchWork({db,bucket,kind,row,now=Date.now(),prepareReference=ensureSketchReference}){
 const key=sketchClaimKey(kind,row.id);
 const old=await db.prepare('SELECT value,lease,lease_until FROM hunem_runtime WHERE id=?').bind(key).first();
 if(old?.lease&&old.lease_until>now)throw Error('SKETCH_BUSY');
 const previous=old&&JSON.parse(old.value);
 const lease=previous?.queued&&old.lease?old.lease:randomUUID();
 const work=sketchPacket(kind,row);work.save.arguments.lease=lease;
 const refs=await prepareReference({bucket,kind,row,now});
 if(!refs.photos?.length)return {action:'reference_pending',kind,id:row.id,referenceErrors:refs.errors||['REFERENCE_NOT_PREPARED']};
 // Webhooks carry source descriptors, never megabytes of inline photo bytes.
 // The task reads persisted bytes with one native MCP call; never browses upstream.
 const references=refs.photos.map(({bytes,...photo})=>photo);
 const packet={action:'generate',kind,id:row.id,work,references,referenceRead:{tool:'hunem_sketch_reference',arguments:{kind,id:row.id}},referenceErrors:refs.errors,preparedAt:previous?.preparedAt||now};
 await db.prepare('INSERT INTO hunem_runtime(id,value,revision,updated_at,lease,lease_until) VALUES(?,?,0,?,?,0) ON CONFLICT(id) DO UPDATE SET value=excluded.value,lease=excluded.lease,lease_until=0,revision=revision+1,updated_at=excluded.updated_at').bind(key,JSON.stringify({queued:true,preparedAt:packet.preparedAt,packet}),now,lease).run();
 return packet;
}
export async function activateQueuedSketch(db,kind,id,lease,now=Date.now()){
 if(!lease)return;
 await db.prepare("UPDATE hunem_runtime SET value=json_set(value,'$.queued',json('false'),'$.startedAt',?),lease_until=? WHERE id=? AND lease=? AND json_extract(value,'$.queued')=1 AND lease_until=0").bind(now,now+20*60000,sketchClaimKey(kind,id),lease).run();
}
export const sketchKinds=['footprint','meal','soda'];
export const sketchTaskInstruction='Use data.sketch.work and its save contract. Call hunem_sketch_reference once with this kind and event ID to view photos already stored on Sites. Do not browse, search, download files, or use shell. Only draw when action=generate and native reference images are present. Use image_gen.imagegen with drawingPrompt and transparent_background=true, visually review the original, then submit that original path through work.save. The server checks PNG properties and releases art only after activity completion. For legacy events without data.sketch use hunem_prepare_sketch once; use its native images. On missing reference report REFERENCE_UNAVAILABLE; environment unavailable means TASK_INTERRUPTED; stop. Preserve originals for same-image save retries, never redraw on save failure. Do not claim, poll, replay, edit schedules/world/journals, or expose leases. Success/busy/already-drawn are quiet.';
const styles={
 meal:'Quick loose graphite and light watercolor sketch of the named dish, faithful to the reference; do not invent ingredients.',
 soda:'Quick loose graphite and light watercolor product sketch; preserve the reviewed brand, flavour, container and label, never substitute another product.',
 footprint:'Quick on-site pencil and light watercolor landmark sketch, sparse broken lines, a few light washes and ample negative space. Preserve current silhouette, proportions, windows and tower shape; depict present-day remains for demolished sites. Natural viewpoint and subject size, no forced centering, fixed three-quarter angle, polished architectural rendering, invented/mirrored architecture, text or collage.'
};
export function sketchPacket(kind,row){
 if(!sketchKinds.includes(kind)||!row?.name)throw Error('INVALID_SKETCH_SUBJECT');
 if(kind==='soda'&&!row.illustrationPackage){const p=sodaPackageReference(row);if(p)row={...row,illustrationPackage:{packageKind:p.packageKind,sizeMl:p.sizeMl||null,packageSelector:p.packageSelector||null,sourcePage:p.sourcePage,sourceImage:p.sourceImage,referenceRole:'catalog-illustration-package',actualPurchasePackageKnown:false}};}
 const subject={name:row.name,source:row.source||null,cityId:row.cityId||row.occurrences?.[0]?.location||null,
  ...(kind==='meal'?{region:row.region||null,country:row.country||null,summary:row.summary||null}:{}),
  ...(kind==='soda'?{brand:row.brand||null,flavour:row.flavour||null,illustrationPackage:row.illustrationPackage||null}:{}),
  ...(kind==='footprint'?{topicId:row.topicId||null,coordinates:row.p||null}:{})};
 const review=kind==='footprint'?'landmarkRecognizable':'subjectRecognizable';
 return {version:1,kind,id:row.id,subject,
  drawingPrompt:`${styles[kind]} Subject data: ${JSON.stringify(subject)}. One square PNG with a transparent background and a recognizable subject. No character.`,
  output:{format:'png',square:true,transparent:true},
  save:{tool:kind==='footprint'?'hunem_receive_footprint':'hunem_receive_collection',arguments:{...(kind==='footprint'?{}:{kind}),id:row.id},file:'original generated PNG absolute path',review:{tool:'image_gen.imagegen',actuallyCalled:true,[review]:true,originalGeneratedPath:'same original absolute path'},reviewRule:'Set true only after actual generation and visual review; server checks file properties.'},
  referencePolicy:{nativePhotos:true,cacheRequired:true,ifUnavailable:'Stop and report REFERENCE_UNAVAILABLE. References must come from Sites storage; no browser or search.',...(kind==='soda'?{useReviewedIllustrationPackage:true,actualPurchasePackageRequired:false}:{})},
  release:'server-only-after-activity-completion'};
}
export async function prepareSketchWork({db,kind,id,rows,claim,reference}){
 if(!sketchKinds.includes(kind)||id!==undefined&&!/^[a-f0-9]{32}$/.test(id))throw Error('INVALID_SKETCH');
 if(id===undefined){
  // Missing event ID recovery is bounded to delivered, committed, undrawn work.
  // Never choose the latest item or ask the model to disambiguate history.
  const prefix=kind==='footprint'?'footprint-event:':'collection-event:'+kind+':';
  const field=kind==='footprint'?'footprintId':'collectionId';
  const delivered=await db.prepare(`SELECT DISTINCT json_extract(value,'$.${field}') AS item_id FROM hunem_runtime WHERE id LIKE ? AND json_extract(value,'$.status')='sent'`).bind(prefix+'%').all();
  const ids=new Set(delivered.results.map(r=>r.item_id));
  const candidates=rows.filter(r=>!r.image&&r.selectionRecorded&&ids.has(r.id));
  if(candidates.length!==1) return {action:'identity_required',kind,reason:'EVENT_ID_MISSING_OR_AMBIGUOUS'};
  id=candidates[0].id;
 }
 const row=rows.find(r=>r.id===id);if(!row||kind!=='footprint'&&!row.sketchEligible)throw Error('RECORDED_SKETCH_REQUIRED');
 if(row.image)return {action:'already-drawn',kind,id};
 // Compatibility for already configured tasks: read the prepared contract,
 // never claim again or start the drawing timeout while the executor waits.
 const queued=await db.prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(sketchClaimKey(kind,id)).first();
 const saved=queued&&JSON.parse(queued.value);
 const acquired=saved?.queued&&saved.packet?{action:'generate',lease:saved.packet.work.save.arguments.lease}:await claim(id);if(acquired.action!=='generate')return acquired;
 // Legacy tasks also stop without stored reference bytes.
 let refs={photos:[],errors:[]};try{refs=await reference(id);}catch{refs.errors=['REFERENCE_CACHE_UNAVAILABLE'];}
 if(!refs.photos?.length)return {action:'reference_pending',kind,id,referenceErrors:refs.errors};
 const packet={action:'generate',kind,id,lease:acquired.lease,expiresAt:acquired.expiresAt,work:sketchPacket(kind,row),referenceErrors:refs.errors||[],
  references:(refs.photos||[]).map(({bytes,...photo})=>photo)};
 packet.work.save.arguments.lease=acquired.lease;
 return {content:[{type:'text',text:JSON.stringify(packet)},...(refs.photos||[]).map(p=>({type:'image',mimeType:p.mimeType,data:Buffer.from(p.bytes).toString('base64')}))],isError:false};
}

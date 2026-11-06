// Deterministic work preparation. The model receives one subject, not world history.
export const sketchKinds=['footprint','meal','soda'];
export const sketchTaskInstruction='Call hunem_prepare_sketch once for this event kind and ID (omit ID only if absent). Follow the returned action; only generate may draw. Inspect the supplied references or acquire a reliable native photo if none is usable, then use image_gen.imagegen with drawingPrompt and transparent_background=true. Visually review the original and submit it with the returned save contract. PNG dimensions, transparency, hash, storage and release are checked by the server; no shell inspection or queue/status polling is needed. On failure record the supported failure code and stop; environment unavailable means TASK_INTERRUPTED. Keep generated originals for same-image save retries, never redraw on save failure. Do not replay events, edit schedules/world/journals, or expose leases. Success/busy/already-drawn are quiet.';
const styles={
 meal:'Quick loose graphite and light watercolor sketch of the named dish, faithful to the reference; do not invent ingredients.',
 soda:'Quick loose graphite and light watercolor product sketch; preserve the reviewed brand, flavour, container and label, never substitute another product.',
 footprint:'Quick on-site pencil and light watercolor landmark sketch, sparse broken lines, a few light washes and ample negative space. Preserve current silhouette, proportions, windows and tower shape; depict present-day remains for demolished sites. Natural viewpoint and subject size, no forced centering, fixed three-quarter angle, polished architectural rendering, invented/mirrored architecture, text or collage.'
};
export function sketchPacket(kind,row){
 if(!sketchKinds.includes(kind)||!row?.name)throw Error('INVALID_SKETCH_SUBJECT');
 const subject={name:row.name,source:row.source||null,cityId:row.cityId||row.occurrences?.[0]?.location||null,
  ...(kind==='meal'?{region:row.region||null,country:row.country||null,summary:row.summary||null}:{}),
  ...(kind==='soda'?{brand:row.brand||null,flavour:row.flavour||null,illustrationPackage:row.illustrationPackage||null}:{}),
  ...(kind==='footprint'?{topicId:row.topicId||null,coordinates:row.p||null}:{})};
 const review=kind==='footprint'?'landmarkRecognizable':'subjectRecognizable';
 return {version:1,kind,id:row.id,subject,
  drawingPrompt:`${styles[kind]} Subject data: ${JSON.stringify(subject)}. One square PNG with a transparent background and a recognizable subject. No character.`,
  output:{format:'png',square:true,transparent:true},
  save:{tool:kind==='footprint'?'hunem_receive_footprint':'hunem_receive_collection',arguments:{...(kind==='footprint'?{}:{kind}),id:row.id},file:'original generated PNG absolute path',review:{tool:'image_gen.imagegen',actuallyCalled:true,[review]:true,originalGeneratedPath:'same original absolute path'},reviewRule:'Set true only after actual generation and visual review; server checks file properties.'},
  referencePolicy:{nativePhotos:true,cacheRequired:false,ifUnavailable:'Acquire a reliable native photo of this exact subject; record REFERENCE_UNAVAILABLE only if none is usable.',...(kind==='soda'?{useReviewedIllustrationPackage:true,actualPurchasePackageRequired:false}:{})},
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
 const acquired=await claim(id);if(acquired.action!=='generate')return acquired;
 // Cache is optional: an unavailable cache must not invalidate a successful claim.
 let refs={photos:[],errors:[]};try{refs=await reference(id);}catch{refs.errors=['REFERENCE_CACHE_UNAVAILABLE'];}
 const packet={action:'generate',kind,id,lease:acquired.lease,expiresAt:acquired.expiresAt,work:sketchPacket(kind,row),referenceErrors:refs.errors||[],
  references:(refs.photos||[]).map(({bytes,...photo})=>photo)};
 packet.work.save.arguments.lease=acquired.lease;
 return {content:[{type:'text',text:JSON.stringify(packet)},...(refs.photos||[]).map(p=>({type:'image',mimeType:p.mimeType,data:Buffer.from(p.bytes).toString('base64')}))],isError:false};
}

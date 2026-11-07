import {validateCollectionImage} from '../bridge/collection-image.mjs';
import {recordSketchStep,activateQueuedSketch} from '../bridge/sketch-progress.mjs';
import {env} from 'cloudflare:workers';
import {committed} from './runtime';
import {footprintInventory,mapFootprints} from '../bridge/footprints.mjs';
import {pngReceipt} from '../bridge/mcp-file.mjs';
import {makeReferencePreview} from '../bridge/reference-preview.mjs';
import {drawingSketches,sketchIsPublic,publishCompletedSketches} from '../bridge/sketch-lifecycle.mjs';
import {verifyCollectionArtifacts} from '../bridge/collection-artifacts.mjs';
import {footprintReferenceCache} from '../bridge/footprint-reference.mjs';
import {referenceHandoffInstruction} from '../bridge/reference-handoff-instruction.mjs';
import {collectionReferenceResult} from '../bridge/collection-reference.mjs';
const db=()=>env.DB as D1Database,bucket=()=>env.BUCKET as R2Bucket;
const isId=(id:any)=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
export async function footprints(drawing=false){
 const p=await committed(),rows=drawing?await drawingSketches(db(),p,'footprint'):footprintInventory(p,Math.min(Date.now(),p.world.now));
 const saved=await db().prepare("SELECT id,value FROM hunem_runtime WHERE id LIKE 'footprint:%'").all<any>();
 const images=new Map((saved.results||[]).map((r:any)=>[r.id.slice(10),JSON.parse(r.value)]));
 return rows.map((r:any)=>{const stored:any=images.get(r.id),image=drawing||sketchIsPublic(stored)?stored:null;return {...r,image:image?{src:image.src,thumbnail:image.thumbnail,sha256:image.sha256,drawnAt:image.drawnAt,width:image.width,height:image.height}:null};});
}
export async function footprintRead(u:URL){
 const rows=await footprints();
 const coord=(k:string)=>u.searchParams.has(k)?Number(u.searchParams.get(k)):NaN;
 if(u.searchParams.get('mode')==='map')return {total:rows.length,points:mapFootprints(rows,{west:coord('west'),south:coord('south'),east:coord('east'),north:coord('north'),zoom:coord('zoom')}),timeZone:'Europe/Berlin'};
 const page=Math.max(0,Math.floor(Number(u.searchParams.get('page'))||0)),id=u.searchParams.get('id'),selected=id?rows.filter((r:any)=>r.id===id):rows;
 let filtered=selected;if(u.searchParams.has('area')){const area=u.searchParams.get('area')!.split(',').map(Number);if(area.length!==4||!area.every(Number.isFinite)||area[0]>area[2]||area[1]>area[3]||Math.abs(area[0])>180||Math.abs(area[2])>180||Math.abs(area[1])>90||Math.abs(area[3])>90)throw Error('INVALID_BOUNDS');filtered=selected.filter((r:any)=>r.p&&r.p[0]>=area[0]&&r.p[0]<=area[2]&&r.p[1]>=area[1]&&r.p[1]<=area[3]);}
 return {total:filtered.length,overallTotal:rows.length,page,hasMore:!id&&(page+1)*12<filtered.length,items:id?filtered:filtered.slice(page*12,(page+1)*12),timeZone:'Europe/Berlin'};
}
async function footprintQueueData(){
 const rows=await footprints(true);return {pending:rows.filter((r:any)=>!r.image).length,items:rows.filter((r:any)=>!r.image).sort((a:any,b:any)=>a.firstSeenAt-b.firstSeenAt).slice(0,8),instructions:'For a committed landmark selection, process only its footprintId now, before completion and independently of nightly journals. Saving stores private prepared art; a real completed visit releases it. Do not wait for a visit to finish and do not redraw at completion. Call hunem_claim_footprint BEFORE imagegen; generate only for action=generate, skip busy/already-drawn. Pass its lease to hunem_receive_footprint. Generate ONE distinct quick pencil-and-watercolor recognizable landmark sketch per item with image_gen.imagegen. Inspect real current photographs and pass available photos through referenced_image_paths as architecture references: preserve silhouette, proportions, windows and tower shape, including present-day remains for demolished sites. Choose a real distinctive viewpoint, natural subject size and sparse broken pencil lines with light washes; avoid a fixed three-quarter view, forced centering, a fixed 80-90 percent size or polished architectural rendering. Compare recent sketches when available, without inventing or mirroring architecture for variety. If reliable visual reference is unavailable, leave pending and report. No generic category icon, text, collage, or reused daily illustration. Square PNG, transparent background, landmark only; verify actual dimensions and alpha before submitting. actuallyCalled and landmarkRecognizable must reflect real generation and visual review. Ordinary event saves are immutable and reused for revisits; explicit owner-requested corrections alone use hunem_replace_footprint with current expectedSha256. Never claim, rewrite or publish a journal from a visit event. Pending sketches survive retries; the daily journal cutoff is unchanged.'};
}
export async function footprintQueue(id?:string){
 if(id!==undefined&&!isId(id))throw Error('INVALID_FOOTPRINT');
 const queue=await footprintQueueData();
 const data={...queue,items:queue.items.filter((r:any)=>!id||r.id===id),instructions:queue.instructions+' '+referenceHandoffInstruction};
 if(!id)return data;
 const row=(await footprints(true)).find((r:any)=>r.id===id);
 data.items=row&&!row.image?[row]:[];
 const reference:any=row&&!row.image?await footprintReferenceCache({bucket:bucket()}).read(id):{photos:[],errors:[],preparedAt:null};
 return collectionReferenceResult({...data,kind:'footprint',referenceCollectionId:id},reference);
}
export async function prepareFootprintReferences(p:any){
 const lock='footprint-reference-preparation',lease=crypto.randomUUID(),at=Date.now();
 await db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(lock,'{}',at).run();
 if(!await db().prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING id').bind(lease,at+60000,lock,at).first())return;
 try{
  const rows=await drawingSketches(db(),p,'footprint'),cache=footprintReferenceCache({bucket:bucket()});
  const saved=await db().prepare("SELECT id,value FROM hunem_runtime WHERE id LIKE 'footprint:%'").all<any>();
  const drawn=new Map((saved.results||[]).map((r:any)=>[r.id.slice(10),JSON.parse(r.value)]));
  await cache.sweep(drawn,new Set(rows.filter((r:any)=>!drawn.has(r.id)).map((r:any)=>r.id)));
  let attempts=0;for(const row of rows.filter((r:any)=>!drawn.has(r.id)&&Number.isFinite(r.selectedAt)).slice(0,16)){
   if(!await cache.shouldPrepare(row.id))continue;
   await cache.prepare(row);
   const latest=await db().prepare('SELECT value FROM hunem_runtime WHERE id=?').bind('footprint:'+row.id).first<any>();
   if(latest)await cache.finish(row.id,JSON.parse(latest.value));
   if(++attempts>=2)break;
  }
 }finally{await db().prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(lock,lease).run();}
}
export async function claimFootprint(id:string){
 if(!isId(id))throw Error('INVALID_FOOTPRINT');const row=(await footprints(true)).find((r:any)=>r.id===id);if(!row)throw Error('VISIT_REQUIRED');if(row.image)return {action:'already-drawn',id};
 const key='footprint-claim:'+id,now=Date.now(),lease=crypto.randomUUID();
 await db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(key,'{}',now).run();
 const result=await db().prepare('UPDATE hunem_runtime SET lease=?,lease_until=?,value=? WHERE id=? AND (lease IS NULL OR lease_until<?) AND COALESCE(json_extract(value,"$.queued"),0)!=1 RETURNING id').bind(lease,now+20*60000,JSON.stringify({startedAt:now}),key,now).first();
 if(result)await recordSketchStep(db(),'footprint',id,'claimed',{now});
 return result?{action:'generate',id,lease,expiresAt:now+20*60000,item:row}:{action:'busy',id};
}
export async function saveFootprint(id:string,bytes:Buffer,review:any,lease?:string){
 if(!isId(id))throw Error('INVALID_FOOTPRINT');
 const rows=await footprints(true),row=rows.find((r:any)=>r.id===id);if(!row)throw Error('VISIT_REQUIRED');
 const receipt=pngReceipt(bytes);
 if(row.image){
  if(row.image.sha256!==receipt.sha256)throw Error('FOOTPRINT_ALREADY_DRAWN');
  await publishCompletedSketches({db:db(),bucket:bucket(),p:await committed(),onlyKind:'footprint',onlyId:id});
  const saved=await db().prepare('SELECT value FROM hunem_runtime WHERE id=?').bind('footprint:'+id).first<any>();
  return {...JSON.parse(saved.value),reused:true};
 }
 await activateQueuedSketch(db(),'footprint',id,lease);
 const claim=await db().prepare('SELECT lease,lease_until FROM hunem_runtime WHERE id=?').bind('footprint-claim:'+id).first<any>();
 if(!lease||!claim||claim.lease!==lease||claim.lease_until<=Date.now())throw Error('FOOTPRINT_CLAIM_REQUIRED');
 if(review?.tool!=='image_gen.imagegen'||review.actuallyCalled!==true||review.landmarkRecognizable!==true||!review.originalGeneratedPath)throw Error('FOOTPRINT_REVIEW_REQUIRED');
 validateCollectionImage(bytes);
 await recordSketchStep(db(),'footprint',id,'receiving',{bytes:bytes.length});
 const preview=makeReferencePreview(bytes,{version:'footprint-128-v1',maxEdge:128,quality:78,maxBytes:24000}),base=`footprints/${id}/${receipt.sha256}`,original=base+'.png',thumbnail=base+'.jpg';
 // Back up the authoritative world before first persistent footprint write; no world mutation.
 const backupKey='backups/manual-before-footprints-20261024.json';
 if(!(await bucket().get(backupKey)))await bucket().put(backupKey,JSON.stringify(await committed()),{httpMetadata:{contentType:'application/json'}});
 await bucket().put(original,bytes,{httpMetadata:{contentType:'image/png'}});
 await bucket().put(thumbnail,preview.bytes,{httpMetadata:{contentType:'image/jpeg'}});
 const image={verifiedAt:Date.now(),src:'/'+original,thumbnail:'/'+thumbnail,sha256:receipt.sha256,drawnAt:Date.now(),width:receipt.width,height:receipt.height,review,sketchVersion:2,publishedAt:null};
 await verifyCollectionArtifacts(bucket(),image);
 await db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) SELECT ?,?,0,? FROM hunem_runtime WHERE id=? AND lease=? AND lease_until>?').bind('footprint:'+id,JSON.stringify(image),Date.now(),'footprint-claim:'+id,lease,Date.now()).run();
 const saved=await db().prepare('SELECT value FROM hunem_runtime WHERE id=?').bind('footprint:'+id).first<any>();
 if(!saved)throw Error('FOOTPRINT_CLAIM_REQUIRED');
 const result=JSON.parse(saved.value);if(result.sha256!==receipt.sha256)throw Error('FOOTPRINT_ALREADY_DRAWN');
 await recordSketchStep(db(),'footprint',id,'saved',{bytes:bytes.length});
 await footprintReferenceCache({bucket:bucket()}).finish(id,result);
 if(lease)await db().prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind('footprint-claim:'+id,lease).run();
 await publishCompletedSketches({db:db(),bucket:bucket(),p:await committed(),onlyKind:'footprint',onlyId:id});
 const released=await db().prepare('SELECT value FROM hunem_runtime WHERE id=?').bind('footprint:'+id).first<any>();
 return {id,...JSON.parse(released.value),originalBytes:bytes.length,thumbnailBytes:preview.bytes.length,backupKey,worldModified:false};
}
// Explicit owner-requested correction only. Ordinary event saves stay immutable.
export async function replaceFootprint(id:string,expectedSha256:string,bytes:Buffer,review:any,reason:string){
 if(!isId(id)||typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256))throw Error('INVALID_FOOTPRINT');
 if(typeof reason!=='string'||!reason.trim()||reason.length>500)throw Error('REPLACEMENT_REASON_REQUIRED');
 if(!(await footprints()).some((r:any)=>r.id===id))throw Error('VISIT_REQUIRED');
 const receipt=pngReceipt(bytes);
 if(review?.tool!=='image_gen.imagegen'||review.actuallyCalled!==true||review.landmarkRecognizable!==true||!review.originalGeneratedPath)throw Error('FOOTPRINT_REVIEW_REQUIRED');
 validateCollectionImage(bytes);
 const key='footprint:'+id,old=await db().prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(key).first<any>();
 if(!old)throw Error('FOOTPRINT_NOT_DRAWN');
 const previous=JSON.parse(old.value);
 if(previous.sha256===receipt.sha256){
  if(expectedSha256!==receipt.sha256&&!(await db().prepare('SELECT id FROM hunem_runtime WHERE id=?').bind('footprint-history:'+id+':'+expectedSha256).first()))throw Error('FOOTPRINT_CHANGED');
  return {id,...previous,reused:true,worldModified:false};
 }
 if(previous.sha256!==expectedSha256)throw Error('FOOTPRINT_CHANGED');
 const preview=makeReferencePreview(bytes,{version:'footprint-128-v1',maxEdge:128,quality:78,maxBytes:24000}),base=`footprints/${id}/${receipt.sha256}`,at=Date.now();
 await bucket().put(base+'.png',bytes,{httpMetadata:{contentType:'image/png'}});
 await bucket().put(base+'.jpg',preview.bytes,{httpMetadata:{contentType:'image/jpeg'}});
 const image={src:'/'+base+'.png',thumbnail:'/'+base+'.jpg',sha256:receipt.sha256,drawnAt:at,width:receipt.width,height:receipt.height,review,replacement:{previousSha256:expectedSha256,reason:reason.trim(),at}};
 const historyKey='footprint-history:'+id+':'+expectedSha256;
 const results=await db().batch([
  db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) SELECT ?,value,0,? FROM hunem_runtime WHERE id=? AND value=?').bind(historyKey,at,key,old.value),
  db().prepare('UPDATE hunem_runtime SET value=?,revision=revision+1,updated_at=? WHERE id=? AND value=?').bind(JSON.stringify(image),at,key,old.value)
 ]);
 if(results[1].meta.changes!==1)throw Error('FOOTPRINT_CHANGED');
 return {id,...image,replaced:true,previousSha256:expectedSha256,historyKey,originalBytes:bytes.length,thumbnailBytes:preview.bytes.length,worldModified:false};
}
export async function footprintObject(key:string){
 const match=/^footprints\/([a-f0-9]{32})\/([a-f0-9]{64})\.(png|jpg)$/.exec(key);if(!match)return null;
 const row=(await footprints()).find((r:any)=>r.id===match[1]);if(!row?.image)return null;
 if(row.image.sha256!==match[2]&&!(await db().prepare('SELECT id FROM hunem_runtime WHERE id=?').bind('footprint-history:'+match[1]+':'+match[2]).first()))return null;
 return bucket().get(key);
}

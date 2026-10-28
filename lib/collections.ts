import {env} from 'cloudflare:workers';
import {committed} from './runtime';
import {collectionInventory,collectionKinds} from '../bridge/collections.mjs';
import {pngReceipt} from '../bridge/mcp-file.mjs';
import {makeReferencePreview} from '../bridge/reference-preview.mjs';
import {validateCollectionImage} from '../bridge/collection-image.mjs';
import {collectionReferenceResult} from '../bridge/collection-reference.mjs';
import {mealReferenceCache} from '../bridge/meal-reference-cache.mjs';
import {sodaReferenceCache,sodaPackageReference,reviewedSodaPhoto} from '../bridge/soda-reference.mjs';
import {verifyCollectionArtifacts} from '../bridge/collection-artifacts.mjs';
import {drawingSketches,completedSketches,sketchIsPublic,publishCompletedSketches} from '../bridge/sketch-lifecycle.mjs';
const db=()=>env.DB as D1Database,bucket=()=>env.BUCKET as R2Bucket;
const valid=(kind:string,id?:string)=>{if(!collectionKinds.includes(kind)||id!==undefined&&!/^[a-f0-9]{32}$/.test(id))throw Error('INVALID_COLLECTION');};
export async function collectionRows(kind:string,p?:any,drawing=false){
 valid(kind);p??=await committed();let rows=drawing?await drawingSketches(db(),p,kind):collectionInventory(p,kind,Math.min(Date.now(),p.world.now));
 const saved=await db().prepare('SELECT id,value FROM hunem_runtime WHERE id LIKE ?').bind('collection:'+kind+':%').all<any>();
 const images=new Map((saved.results||[]).map((r:any)=>[r.id.split(':')[2],JSON.parse(r.value)]));
 if(!drawing){const complete=new Map(completedSketches(p,kind).map((r:any)=>[r.id,r]));rows=rows.flatMap((r:any)=>complete.has(r.id)?[complete.get(r.id)]:images.has(r.id)&&(images.get(r.id) as any).sketchVersion!==2?[r]:[]);}
 return rows.map((r:any)=>{const stored:any=images.get(r.id),image=drawing||sketchIsPublic(stored)?stored:null,ref=kind==='soda'?sodaPackageReference(r):null;return {...r,...(kind==='soda'?{illustrationPackage:ref?{packageKind:ref.packageKind,sizeMl:ref.sizeMl||null,packageSelector:ref.packageSelector||null,sourcePage:ref.sourcePage,sourceImage:ref.sourceImage,checkedOn:ref.checkedOn,sourceType:ref.sourceType,sourceYear:ref.sourceYear,referenceRole:ref.referenceRole||'catalog-illustration-package',actualPurchasePackageKnown:false}:null}:{}),image:image?{src:image.src,thumbnail:image.thumbnail,sha256:image.sha256,drawnAt:image.drawnAt,width:image.width,height:image.height,sketchVersion:image.sketchVersion,publishedAt:image.publishedAt}:null};});
}
export async function collectionRead(u:URL){
 if(u.searchParams.get('mode')==='summary'){
  const p=await committed(),[meal,soda]=await Promise.all([collectionRows('meal',p),collectionRows('soda',p)]);
  const summary=(rows:any[])=>({total:rows.length,totalOccurrences:rows.reduce((n,r)=>n+r.count,0)});
  const bottle=p.world.sodaLife?.bottle;return {meal:summary(meal),soda:summary(soda),heldSoda:bottle?{name:bottle.name,flavour:bottle.flavour}:null};
 }
 const kind=u.searchParams.get('kind')||'',rows=await collectionRows(kind),id=u.searchParams.get('id'),page=Math.max(0,Math.floor(Number(u.searchParams.get('page'))||0));
 return {kind,total:rows.length,totalOccurrences:rows.reduce((n:any,r:any)=>n+r.count,0),page,hasMore:!id&&(page+1)*12<rows.length,items:id?rows.filter((r:any)=>r.id===id):rows.slice(page*12,(page+1)*12),timeZone:'Europe/Berlin'};
}
export const collectionInstructions='Process only the event kind and collectionId. Read hunem_collection_queue(kind,id), claim with hunem_claim_collection(kind,id); generate only action=generate, skip busy/already-drawn. Draw only the committed selected dish or soda product, even before the activity finishes. Saving stores a private prepared artwork. Only actual meal_finished or matching soda_finished releases it to readers; purchase is not completion. Do not wait for completion to start drawing and do not generate a second image at completion. Use cached native reference image blocks and pass them to imagegen. Soda illustrationPackage is the explicitly selected official brand/flavour package for the catalog illustration; use packageKind, sizeMl and packageSelector. It is not a claim about historical purchased container. Do not stop merely because actualPurchasePackageKnown=false when this reviewed illustration reference exists. One unique loose graphite and light watercolor square transparent PNG, no character. Do not invent ingredients or labels. Verify actual square dimensions and alpha; visually review then submit original PNG through hunem_receive_collection(kind,id,lease,file,review). On a failed step, call hunem_record_collection_failure(kind,id,code) with one supported failure code; keep any generated original for save retries instead of redrawing. Existing sketches are reused; no journal/world changes or new schedules.';
export async function collectionQueue(kind:string,id?:string){valid(kind,id);const rows=(await collectionRows(kind,undefined,true)).filter((r:any)=>r.sketchEligible&&!r.image);return {kind,pending:rows.length,items:rows.filter((r:any)=>!id||r.id===id).sort((a:any,b:any)=>a.firstSeenAt-b.firstSeenAt).slice(0,8),instructions:collectionInstructions};}
export async function collectionQueueContent(kind:string,id?:string){
 const queue=await collectionQueue(kind,id);if(!id)return collectionReferenceResult(queue);
 const row=queue.items[0]||(await collectionRows(kind,undefined,true)).find((r:any)=>r.id===id);if(!row)return collectionReferenceResult(queue);
 const reference:any=row.image?{photos:[],errors:[],preparedAt:null}:await (kind==='meal'?mealReferenceCache({bucket:bucket()}):sodaReferenceCache({bucket:bucket()})).read(id);
 return collectionReferenceResult({...queue,referenceCollectionId:id,referenceOnly:queue.items.length===0},reference);
}
export async function prepareMealReferences(p:any,onlyId?:string){
 const lock='meal-reference-preparation',lease=crypto.randomUUID(),at=Date.now();
 await db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(lock,'{}',at).run();
 const acquired=await db().prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING id').bind(lease,at+60000,lock,at).first();if(!acquired)return;
 try{
 const cache=mealReferenceCache({bucket:bucket()}),rows=await collectionRows('meal',p,true),drawn=new Map(rows.filter((r:any)=>r.image).map((r:any)=>[r.id,r.image]));
 await cache.sweep(drawn);
 let attempts=0;for(const row of rows.filter((r:any)=>!r.image&&(!onlyId||r.id===onlyId)).slice(0,16)){if(!await cache.shouldPrepare(row.id))continue;await cache.prepare(row);const latest=(await collectionRows('meal',undefined,true)).find((r:any)=>r.id===row.id);if(latest?.image)await cache.finish(row.id,latest.image);if(++attempts>=2)break;}
 }finally{await db().prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(lock,lease).run();}
}
export async function prepareSodaReferences(p:any,onlyId?:string){
 const lock='soda-reference-preparation',lease=crypto.randomUUID(),at=Date.now();
 await db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(lock,'{}',at).run();
 if(!await db().prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING id').bind(lease,at+60000,lock,at).first())return;
 try{const cache=sodaReferenceCache({bucket:bucket()}),rows=await collectionRows('soda',p,true),drawn=new Map(rows.filter((r:any)=>r.image).map((r:any)=>[r.id,r.image]));await cache.sweep(drawn);let attempts=0;
  for(const row of rows.filter((r:any)=>!r.image&&(!onlyId||r.id===onlyId)).slice(0,16)){if(!await cache.shouldPrepare(row.id))continue;await cache.prepare(row);const latest=(await collectionRows('soda',undefined,true)).find((r:any)=>r.id===row.id);if(latest?.image)await cache.finish(row.id,latest.image);if(++attempts>=2)break;}
 }finally{await db().prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(lock,lease).run();}
}
export async function repairCollectionReference(kind:string,id:string){
 valid(kind,id);if(kind==='meal')return repairMealReference(id);const p=await committed(),row=(await collectionRows(kind,p,true)).find((r:any)=>r.id===id);
 if(!row?.sketchEligible)throw Error('RECORDED_SPECIALTY_OR_PURCHASE_REQUIRED');if(row.image)return {kind,id,alreadyDrawn:true,worldModified:false};
 await prepareSodaReferences(p,id);const {photos,errors,preparedAt}=await sodaReferenceCache({bucket:bucket()}).read(id);
 return {kind,id,preparedAt,errors,photos:photos.map(({bytes,...photo}:any)=>photo),worldModified:false};
}
// Explicit owner repair of one known selection; never advances the world.
export async function repairMealReference(id:string){
 valid('meal',id);const p=await committed(),row=(await collectionRows('meal',p,true)).find((r:any)=>r.id===id);
 if(!row?.sketchEligible)throw Error('RECORDED_SPECIALTY_OR_PURCHASE_REQUIRED');
 if(row.image)return {id,alreadyDrawn:true,worldModified:false};
 await prepareMealReferences(p,id);
 const {photos,errors,preparedAt}=await mealReferenceCache({bucket:bucket()}).read(id);
 return {id,preparedAt,errors,photos:photos.map(({bytes,...photo}:any)=>photo),worldModified:false};
}
// Owner-only repair path; the native file bytes must match a reviewed source hash.
export async function cacheSodaReference(id:string,bytes:Buffer){
 valid('soda',id);const p=await committed(),row=(await collectionRows('soda',p,true)).find((r:any)=>r.id===id);
 if(!row?.sketchEligible)throw Error('RECORDED_SPECIALTY_OR_PURCHASE_REQUIRED');if(row.image)return {id,action:'already-drawn',worldModified:false};
 const photo=reviewedSodaPhoto(row,bytes),lock='soda-reference-preparation',lease=crypto.randomUUID(),at=Date.now();
 await db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(lock,'{}',at).run();
 if(!await db().prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING id').bind(lease,at+60000,lock,at).first())throw Error('REFERENCE_PREPARATION_BUSY');
 try{const cache=mealReferenceCache({bucket:bucket(),kind:'soda',lookup:async()=>({photos:[photo],errors:[]}),lookupVersion:'reviewed-owner-import:'+id+':20261028'});await cache.prepare(row);const r=await cache.read(id);return {id,preparedAt:r.preparedAt,photos:r.photos.map(({bytes,...p}:any)=>p),errors:r.errors,worldModified:false};
 }finally{await db().prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(lock,lease).run();}
}
export async function claimCollection(kind:string,id:string){
 valid(kind,id);const row=(await collectionRows(kind,undefined,true)).find((r:any)=>r.id===id);if(!row||!row.sketchEligible)throw Error('RECORDED_SPECIALTY_OR_PURCHASE_REQUIRED');if(row.image)return {action:'already-drawn',kind,id};
 const key='collection-claim:'+kind+':'+id,now=Date.now(),lease=crypto.randomUUID();
 await db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(key,'{}',now).run();
 const acquired=await db().prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING id').bind(lease,now+20*60000,key,now).first();
 return acquired?{action:'generate',kind,id,lease,expiresAt:now+20*60000,item:row}:{action:'busy',kind,id};
}
export async function saveCollection(kind:string,id:string,lease:string,bytes:Buffer,review:any){
 valid(kind,id);const row=(await collectionRows(kind,undefined,true)).find((r:any)=>r.id===id);if(!row||!row.sketchEligible)throw Error('RECORDED_SPECIALTY_OR_PURCHASE_REQUIRED');
 const receipt=pngReceipt(bytes);if(row.image){
  if(row.image.sha256!==receipt.sha256)throw Error('COLLECTION_ALREADY_DRAWN');
  await (kind==='meal'?mealReferenceCache({bucket:bucket()}):sodaReferenceCache({bucket:bucket()})).finish(id,row.image);
  await publishCompletedSketches({db:db(),bucket:bucket(),p:await committed(),onlyKind:kind,onlyId:id});
  const saved=await db().prepare('SELECT value FROM hunem_runtime WHERE id=?').bind('collection:'+kind+':'+id).first<any>();
  return {kind,id,...JSON.parse(saved.value),reused:true,worldModified:false};
 }
 const claimKey='collection-claim:'+kind+':'+id,claim=await db().prepare('SELECT lease,lease_until FROM hunem_runtime WHERE id=?').bind(claimKey).first<any>();
 if(typeof lease!=='string'||!claim||claim.lease!==lease||claim.lease_until<Date.now())throw Error('COLLECTION_CLAIM_REQUIRED');
 if(review?.tool!=='image_gen.imagegen'||review.actuallyCalled!==true||review.subjectRecognizable!==true||!review.originalGeneratedPath)throw Error('COLLECTION_REVIEW_REQUIRED');
 validateCollectionImage(bytes);
 const preview=makeReferencePreview(bytes,{version:'collection-128-v1',maxEdge:128,quality:78,maxBytes:24000}),base=`collections/${kind}/${id}/${receipt.sha256}`;
 const backupKey='backups/manual-before-meal-soda-collections-20261024.json';if(!(await bucket().get(backupKey)))await bucket().put(backupKey,JSON.stringify(await committed()),{httpMetadata:{contentType:'application/json'}});
 await bucket().put(base+'.png',bytes,{httpMetadata:{contentType:'image/png'}});await bucket().put(base+'.jpg',preview.bytes,{httpMetadata:{contentType:'image/jpeg'}});
 const image={src:'/'+base+'.png',thumbnail:'/'+base+'.jpg',sha256:receipt.sha256,drawnAt:Date.now(),width:receipt.width,height:receipt.height,review,verifiedAt:0,sketchVersion:2,publishedAt:null},key='collection:'+kind+':'+id;
 await verifyCollectionArtifacts(bucket(),image);
 image.verifiedAt=Date.now();
 await db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) SELECT ?,?,0,? FROM hunem_runtime WHERE id=? AND lease=? AND lease_until>=?').bind(key,JSON.stringify(image),Date.now(),claimKey,lease,Date.now()).run();
 const record=await db().prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(key).first<any>();if(!record)throw Error('COLLECTION_CLAIM_REQUIRED');const saved=JSON.parse(record.value);if(saved.sha256!==receipt.sha256)throw Error('COLLECTION_ALREADY_DRAWN');
 await (kind==='meal'?mealReferenceCache({bucket:bucket()}):sodaReferenceCache({bucket:bucket()})).finish(id,saved);
 await db().prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(claimKey,lease).run();
 // A late save releases only against a real completion, using the same release path.
 await publishCompletedSketches({db:db(),bucket:bucket(),p:await committed(),onlyKind:kind,onlyId:id});
 const released=await db().prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(key).first<any>();
 return {kind,id,...JSON.parse(released.value),originalBytes:bytes.length,thumbnailBytes:preview.bytes.length,worldModified:false};
}
export async function collectionObject(key:string){
 const m=/^collections\/(meal|soda)\/([a-f0-9]{32})\/([a-f0-9]{64})\.(png|jpg)$/.exec(key);if(!m)return null;
 const row=(await collectionRows(m[1])).find((r:any)=>r.id===m[2]);if(row?.image?.sha256!==m[3])return null;return bucket().get(key);
}

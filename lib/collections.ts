import {env} from 'cloudflare:workers';
import {committed} from './runtime';
import {collectionInventory,collectionKinds} from '../bridge/collections.mjs';
import {pngReceipt} from '../bridge/mcp-file.mjs';
import {makeReferencePreview} from '../bridge/reference-preview.mjs';
import {validateCollectionImage} from '../bridge/collection-image.mjs';
import {collectionReference,collectionReferenceResult,referenceMime} from '../bridge/collection-reference.mjs';
const db=()=>env.DB as D1Database,bucket=()=>env.BUCKET as R2Bucket;
const valid=(kind:string,id?:string)=>{if(!collectionKinds.includes(kind)||id!==undefined&&!/^[a-f0-9]{32}$/.test(id))throw Error('INVALID_COLLECTION');};
export async function collectionRows(kind:string,p?:any){
 valid(kind);p??=await committed();const rows=collectionInventory(p,kind,Math.min(Date.now(),p.world.now));
 const saved=await db().prepare('SELECT id,value FROM hunem_runtime WHERE id LIKE ?').bind('collection:'+kind+':%').all<any>();
 const images=new Map((saved.results||[]).map((r:any)=>[r.id.split(':')[2],JSON.parse(r.value)]));
 return rows.map((r:any)=>{const image:any=images.get(r.id);return {...r,image:image?{src:image.src,thumbnail:image.thumbnail,sha256:image.sha256,drawnAt:image.drawnAt,width:image.width,height:image.height}:null};});
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
export const collectionInstructions='Process only the event kind and collectionId. Read hunem_collection_queue(kind,id), claim with hunem_claim_collection(kind,id); generate only action=generate, skip busy/already-drawn. Meal sketches only sourced localDish meals completed; soda sketches correspond to actual purchases, not a claim of already finishing the bottle. Inspect current reliable dish/official product photographs and pass them as imagegen visual references. One unique loose graphite and light watercolor square transparent PNG of food or exact brand/flavour bottle/can, no character needed. Preserve identifying appearance; do not invent food ingredients or product labels. If visual reference cannot be confirmed leave pending. Verify actual square dimensions and alpha; visually review then submit original PNG through hunem_receive_collection(kind,id,lease,file,review). Existing sketches are reused on repeat consumption/purchase; no journal/world changes, no new schedules.';
export async function collectionQueue(kind:string,id?:string){valid(kind,id);const rows=(await collectionRows(kind)).filter((r:any)=>r.sketchEligible&&!r.image);return {kind,pending:rows.length,items:rows.filter((r:any)=>!id||r.id===id).sort((a:any,b:any)=>a.firstSeenAt-b.firstSeenAt).slice(0,8),instructions:collectionInstructions};}
export async function collectionQueueContent(kind:string,id?:string){
 const queue=await collectionQueue(kind,id);if(!id||kind!=='meal')return collectionReferenceResult(queue);
 const row=queue.items[0]||(await collectionRows(kind)).find((r:any)=>r.id===id);if(!row)return collectionReferenceResult(queue);
 const key='reference-photos/meal-v1/'+id+'.json',cached=await bucket().get(key);let reference:any;
 if(cached)try{const c:any=await cached.json();if(Date.now()-c.at<86400000&&Array.isArray(c.photos)&&c.photos.length<=2){const photos=c.photos.map((p:any)=>({...p,bytes:Buffer.from(p.data,'base64')}));if(photos.every((p:any)=>p.bytes.length<=768*1024&&referenceMime(p.bytes)===p.mimeType))reference={photos,errors:[]};}}catch{}
 if(!reference){reference=await collectionReference(row);if(reference.photos.length)await bucket().put(key,JSON.stringify({at:Date.now(),photos:reference.photos.map(({bytes,...p}:any)=>({...p,data:Buffer.from(bytes).toString('base64')}))}),{httpMetadata:{contentType:'application/json'}});}
 return collectionReferenceResult({...queue,referenceCollectionId:id,referenceOnly:queue.items.length===0},reference);
}
export async function claimCollection(kind:string,id:string){
 valid(kind,id);const row=(await collectionRows(kind)).find((r:any)=>r.id===id);if(!row||!row.sketchEligible)throw Error('RECORDED_SPECIALTY_OR_PURCHASE_REQUIRED');if(row.image)return {action:'already-drawn',kind,id};
 const key='collection-claim:'+kind+':'+id,now=Date.now(),lease=crypto.randomUUID();
 await db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(key,'{}',now).run();
 const acquired=await db().prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING id').bind(lease,now+20*60000,key,now).first();
 return acquired?{action:'generate',kind,id,lease,expiresAt:now+20*60000,item:row}:{action:'busy',kind,id};
}
export async function saveCollection(kind:string,id:string,lease:string,bytes:Buffer,review:any){
 valid(kind,id);const row=(await collectionRows(kind)).find((r:any)=>r.id===id);if(!row||!row.sketchEligible)throw Error('RECORDED_SPECIALTY_OR_PURCHASE_REQUIRED');
 const receipt=pngReceipt(bytes);if(row.image){if(row.image.sha256!==receipt.sha256)throw Error('COLLECTION_ALREADY_DRAWN');return {kind,id,...row.image,reused:true,worldModified:false};}
 const claimKey='collection-claim:'+kind+':'+id,claim=await db().prepare('SELECT lease,lease_until FROM hunem_runtime WHERE id=?').bind(claimKey).first<any>();
 if(typeof lease!=='string'||!claim||claim.lease!==lease||claim.lease_until<Date.now())throw Error('COLLECTION_CLAIM_REQUIRED');
 if(review?.tool!=='image_gen.imagegen'||review.actuallyCalled!==true||review.subjectRecognizable!==true||!review.originalGeneratedPath)throw Error('COLLECTION_REVIEW_REQUIRED');
 validateCollectionImage(bytes);
 const preview=makeReferencePreview(bytes,{version:'collection-128-v1',maxEdge:128,quality:78,maxBytes:24000}),base=`collections/${kind}/${id}/${receipt.sha256}`;
 const backupKey='backups/manual-before-meal-soda-collections-20261024.json';if(!(await bucket().get(backupKey)))await bucket().put(backupKey,JSON.stringify(await committed()),{httpMetadata:{contentType:'application/json'}});
 await bucket().put(base+'.png',bytes,{httpMetadata:{contentType:'image/png'}});await bucket().put(base+'.jpg',preview.bytes,{httpMetadata:{contentType:'image/jpeg'}});
 const image={src:'/'+base+'.png',thumbnail:'/'+base+'.jpg',sha256:receipt.sha256,drawnAt:Date.now(),width:receipt.width,height:receipt.height,review},key='collection:'+kind+':'+id;
 await db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) SELECT ?,?,0,? FROM hunem_runtime WHERE id=? AND lease=? AND lease_until>=?').bind(key,JSON.stringify(image),Date.now(),claimKey,lease,Date.now()).run();
 const record=await db().prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(key).first<any>();if(!record)throw Error('COLLECTION_CLAIM_REQUIRED');const saved=JSON.parse(record.value);if(saved.sha256!==receipt.sha256)throw Error('COLLECTION_ALREADY_DRAWN');
 await db().prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(claimKey,lease).run();
 return {kind,id,...saved,originalBytes:bytes.length,thumbnailBytes:preview.bytes.length,worldModified:false};
}
export async function collectionObject(key:string){
 const m=/^collections\/(meal|soda)\/([a-f0-9]{32})\/([a-f0-9]{64})\.(png|jpg)$/.exec(key);if(!m)return null;
 const row=(await collectionRows(m[1])).find((r:any)=>r.id===m[2]);if(row?.image?.sha256!==m[3])return null;return bucket().get(key);
}

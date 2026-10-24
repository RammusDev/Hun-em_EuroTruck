import {env} from 'cloudflare:workers';
import {committed} from './runtime';
import {footprintInventory,mapFootprints} from '../bridge/footprints.mjs';
import {pngReceipt} from '../bridge/mcp-file.mjs';
import {makeReferencePreview} from '../bridge/reference-preview.mjs';
const db=()=>env.DB as D1Database,bucket=()=>env.BUCKET as R2Bucket;
const isId=(id:any)=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
export async function footprints(){
 const p=await committed(),rows=footprintInventory(p,Math.min(Date.now(),p.world.now));
 const saved=await db().prepare("SELECT id,value FROM hunem_runtime WHERE id LIKE 'footprint:%'").all<any>();
 const images=new Map((saved.results||[]).map((r:any)=>[r.id.slice(10),JSON.parse(r.value)]));
 return rows.map((r:any)=>{const image:any=images.get(r.id);return {...r,image:image?{src:image.src,thumbnail:image.thumbnail,sha256:image.sha256,drawnAt:image.drawnAt,width:image.width,height:image.height}:null};});
}
export async function footprintRead(u:URL){
 const rows=await footprints();
 const coord=(k:string)=>u.searchParams.has(k)?Number(u.searchParams.get(k)):NaN;
 if(u.searchParams.get('mode')==='map')return {total:rows.length,points:mapFootprints(rows,{west:coord('west'),south:coord('south'),east:coord('east'),north:coord('north'),zoom:coord('zoom')}),timeZone:'Europe/Berlin'};
 const page=Math.max(0,Math.floor(Number(u.searchParams.get('page'))||0)),id=u.searchParams.get('id'),selected=id?rows.filter((r:any)=>r.id===id):rows;
 return {total:rows.length,page,hasMore:!id&&(page+1)*12<selected.length,items:id?selected:selected.slice(page*12,(page+1)*12),timeZone:'Europe/Berlin'};
}
export async function footprintQueue(){
 const rows=await footprints();return {pending:rows.filter((r:any)=>!r.image).length,items:rows.filter((r:any)=>!r.image).sort((a:any,b:any)=>a.firstSeenAt-b.firstSeenAt).slice(0,8),instructions:'For a visit event, process only its footprintId now, independently of nightly journals. Call hunem_claim_footprint BEFORE imagegen; generate only for action=generate, skip busy/already-drawn. Pass its lease to hunem_receive_footprint. Generate ONE distinct quick pencil-and-watercolor recognizable landmark sketch per item with image_gen.imagegen. Inspect real current photographs and pass available photos through referenced_image_paths as architecture references: preserve silhouette, proportions, windows and tower shape, including present-day remains for demolished sites. Choose a real distinctive viewpoint, natural subject size and sparse broken pencil lines with light washes; avoid a fixed three-quarter view, forced centering, a fixed 80-90 percent size or polished architectural rendering. Compare recent sketches when available, without inventing or mirroring architecture for variety. If reliable visual reference is unavailable, leave pending and report. No generic category icon, text, collage, or reused daily illustration. Square PNG, transparent background, landmark only; verify actual dimensions and alpha before submitting. actuallyCalled and landmarkRecognizable must reflect real generation and visual review. Ordinary event saves are immutable and reused for revisits; explicit owner-requested corrections alone use hunem_replace_footprint with current expectedSha256. Never claim, rewrite or publish a journal from a visit event. Pending sketches survive retries; the daily journal cutoff is unchanged.'};
}
export async function claimFootprint(id:string){
 if(!isId(id))throw Error('INVALID_FOOTPRINT');const row=(await footprints()).find((r:any)=>r.id===id);if(!row)throw Error('VISIT_REQUIRED');if(row.image)return {action:'already-drawn',id};
 const key='footprint-claim:'+id,now=Date.now(),lease=crypto.randomUUID();
 await db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(key,'{}',now).run();
 const result=await db().prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING id').bind(lease,now+20*60000,key,now).first();
 return result?{action:'generate',id,lease,expiresAt:now+20*60000,item:row}:{action:'busy',id};
}
export async function saveFootprint(id:string,bytes:Buffer,review:any,lease?:string){
 if(!isId(id))throw Error('INVALID_FOOTPRINT');
 const rows=await footprints(),row=rows.find((r:any)=>r.id===id);if(!row)throw Error('VISIT_REQUIRED');
 const receipt=pngReceipt(bytes);
 if(row.image){if(row.image.sha256!==receipt.sha256)throw Error('FOOTPRINT_ALREADY_DRAWN');return {...row.image,reused:true};}
 const claim=await db().prepare('SELECT lease,lease_until FROM hunem_runtime WHERE id=?').bind('footprint-claim:'+id).first<any>();
 if((claim||lease)&&(!claim||claim.lease!==lease||claim.lease_until<Date.now()))throw Error('FOOTPRINT_CLAIM_REQUIRED');
 if(review?.tool!=='image_gen.imagegen'||review.actuallyCalled!==true||review.landmarkRecognizable!==true||!review.originalGeneratedPath)throw Error('FOOTPRINT_REVIEW_REQUIRED');
 if(receipt.width!==receipt.height)throw Error('SQUARE_PNG_REQUIRED');
 const preview=makeReferencePreview(bytes,{version:'footprint-128-v1',maxEdge:128,quality:78,maxBytes:24000}),base=`footprints/${id}/${receipt.sha256}`,original=base+'.png',thumbnail=base+'.jpg';
 // Back up the authoritative world before first persistent footprint write; no world mutation.
 const backupKey='backups/manual-before-footprints-20261024.json';
 if(!(await bucket().get(backupKey)))await bucket().put(backupKey,JSON.stringify(await committed()),{httpMetadata:{contentType:'application/json'}});
 await bucket().put(original,bytes,{httpMetadata:{contentType:'image/png'}});
 await bucket().put(thumbnail,preview.bytes,{httpMetadata:{contentType:'image/jpeg'}});
 const image={src:'/'+original,thumbnail:'/'+thumbnail,sha256:receipt.sha256,drawnAt:Date.now(),width:receipt.width,height:receipt.height,review};
 await db().prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind('footprint:'+id,JSON.stringify(image),Date.now()).run();
 const saved=await db().prepare('SELECT value FROM hunem_runtime WHERE id=?').bind('footprint:'+id).first<any>();
 const result=JSON.parse(saved.value);if(result.sha256!==receipt.sha256)throw Error('FOOTPRINT_ALREADY_DRAWN');
 if(lease)await db().prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind('footprint-claim:'+id,lease).run();
 return {id,...result,originalBytes:bytes.length,thumbnailBytes:preview.bytes.length,backupKey,worldModified:false};
}
// Explicit owner-requested correction only. Ordinary event saves stay immutable.
export async function replaceFootprint(id:string,expectedSha256:string,bytes:Buffer,review:any,reason:string){
 if(!isId(id)||typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256))throw Error('INVALID_FOOTPRINT');
 if(typeof reason!=='string'||!reason.trim()||reason.length>500)throw Error('REPLACEMENT_REASON_REQUIRED');
 if(!(await footprints()).some((r:any)=>r.id===id))throw Error('VISIT_REQUIRED');
 const receipt=pngReceipt(bytes);
 if(review?.tool!=='image_gen.imagegen'||review.actuallyCalled!==true||review.landmarkRecognizable!==true||!review.originalGeneratedPath)throw Error('FOOTPRINT_REVIEW_REQUIRED');
 if(receipt.width!==receipt.height)throw Error('SQUARE_PNG_REQUIRED');
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

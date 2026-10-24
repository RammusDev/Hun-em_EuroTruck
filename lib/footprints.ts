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
 const rows=await footprints();return {pending:rows.filter((r:any)=>!r.image).length,items:rows.filter((r:any)=>!r.image).sort((a:any,b:any)=>a.firstSeenAt-b.firstSeenAt).slice(0,8),instructions:'Generate ONE distinct quick pencil-and-watercolor landmark sketch per item using image_gen.imagegen. The actual named landmark must be recognizable; use its source to verify appearance. No generic category icon, text, collage, or reused daily illustration. Square PNG, transparent background, landmark only (no character required). Inspect before submitting original PNG to hunem_receive_footprint; landmarkRecognizable and actuallyCalled must be true only after real generation and visual review. Existing image is immutable and reused for revisits. Finish the daily journal first; do not delay it or alter its cutoff. Pending sketches persist until a later run. No additional schedule.'};
}
export async function saveFootprint(id:string,bytes:Buffer,review:any){
 if(!isId(id))throw Error('INVALID_FOOTPRINT');
 const rows=await footprints(),row=rows.find((r:any)=>r.id===id);if(!row)throw Error('VISIT_REQUIRED');
 const receipt=pngReceipt(bytes);
 if(row.image){if(row.image.sha256!==receipt.sha256)throw Error('FOOTPRINT_ALREADY_DRAWN');return {...row.image,reused:true};}
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
 return {id,...result,originalBytes:bytes.length,thumbnailBytes:preview.bytes.length,backupKey,worldModified:false};
}
export async function footprintObject(key:string){
 const match=/^footprints\/([a-f0-9]{32})\/([a-f0-9]{64})\.(png|jpg)$/.exec(key);if(!match)return null;
 const row=(await footprints()).find((r:any)=>r.id===match[1]);if(!row?.image||row.image.sha256!==match[2])return null;
 return bucket().get(key);
}

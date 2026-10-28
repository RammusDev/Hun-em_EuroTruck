import {createHash,randomUUID} from 'node:crypto';
import {mealReferenceCache} from './meal-reference-cache.mjs';
import {drawingSketches,sketchKey} from './sketch-lifecycle.mjs';
import {referenceMime} from './collection-reference.mjs';
import {reviewedSodaPhoto} from './soda-reference.mjs';



export async function cacheSketchReference({db,bucket,p,kind,id,lease,bytes,source,now=Date.now()}){
 if(!['meal','soda','footprint'].includes(kind)||!/^[a-f0-9]{32}$/.test(id))throw Error('INVALID_REFERENCE_SUBJECT');
 const row=(await drawingSketches(db,p,kind,now)).find(r=>r.id===id);
 if(!row||kind!=='footprint'&&!row.sketchEligible)throw Error('SELECTED_SUBJECT_REQUIRED');
 const image=await db.prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(sketchKey(kind,id)).first();
 if(image)return {kind,id,action:'already-drawn',worldModified:false};
 const claimKey=kind==='footprint'?'footprint-claim:'+id:'collection-claim:'+kind+':'+id;
 const claim=await db.prepare('SELECT lease,lease_until FROM hunem_runtime WHERE id=?').bind(claimKey).first();
 if(!lease||claim?.lease!==lease||claim.lease_until<=now)throw Error('ACTIVE_REFERENCE_CLAIM_REQUIRED');
 if(bytes.length>1024*1024)throw Error('REFERENCE_TOO_LARGE');
 let photo;
 if(kind==='soda')photo=reviewedSodaPhoto(row,bytes);
 else{
  if(source?.visuallyMatched!==true)throw Error('REFERENCE_VISUAL_REVIEW_REQUIRED');
  for(const field of ['sourcePage','sourceImage']){
   const url=new URL(source[field]);
   // Provenance only; never fetched by this owner-only upload endpoint.
   if(url.protocol!=='https:'||url.username||url.password||url.port||source[field].length>2048)throw Error('INVALID_REFERENCE_SOURCE');
  }
  if(!source.credit?.trim()||!source.license?.trim()||source.credit.length>300||source.license.length>300)throw Error('REFERENCE_PROVENANCE_REQUIRED');
  photo={bytes,mimeType:referenceMime(bytes),title:row.name,sourcePage:source.sourcePage,sourceImage:source.sourceImage,credit:source.credit,license:source.license,preparationMethod:'native-visually-reviewed-handoff'};
 }
 const lock=kind+'-reference-preparation',token=randomUUID();
 await db.prepare('INSERT OR IGNORE INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,0,?)').bind(lock,'{}',now).run();
 if(!await db.prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING id').bind(token,now+60000,lock,now).first())throw Error('REFERENCE_PREPARATION_BUSY');
 try{
  const cache=mealReferenceCache({bucket,kind,now:()=>now,lookup:async()=>({photos:[photo],errors:[]}),lookupVersion:'native-reference-handoff-v1'});
  await cache.prepare(row);
  const saved=await cache.read(id);
  if(!saved.photos.length)throw Error('REFERENCE_SAVE_FAILED');
  return {kind,id,action:'reference-ready',sha256:saved.photos[0].sha256,uploadedSha256:createHash('sha256').update(bytes).digest('hex'),reused:saved.photos[0].sha256!==createHash('sha256').update(bytes).digest('hex'),worldModified:false};
 }finally{await db.prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(lock,token).run();}
}

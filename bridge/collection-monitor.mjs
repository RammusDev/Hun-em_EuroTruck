import {collectionEventService} from './collection-events.mjs';
import {mealReferenceCache} from './meal-reference-cache.mjs';
import {sodaReferenceCache} from './soda-reference.mjs';
export async function collectionMonitor(payload,{DB,BUCKET},{now=Date.now()}={}){
 if(!DB||!BUCKET||!await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hunem_runtime'").first())return null;
 const result={};for(const kind of ['meal','soda']){
  const cache=kind==='meal'?mealReferenceCache({bucket:BUCKET,now:()=>now}):sodaReferenceCache({bucket:BUCKET,now:()=>now});
  const reference=async row=>{const r=await cache.read(row.id);return {ready:r.photos.length>0,errors:r.errors};};
  result[kind]=await collectionEventService({db:DB,bucket:BUCKET,kind,now:()=>now,reference}).status(payload);
 }
 return result;
}

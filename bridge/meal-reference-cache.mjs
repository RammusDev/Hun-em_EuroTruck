import {createHash} from 'node:crypto';
import {collectionInventory} from './collections.mjs';
import {collectionReference,referenceMime} from './collection-reference.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const prefix='reference-photos/meal-v2/';
const ttl=7*86400000;
const lookupVersion='meal-reference-v3-official-arancini';
// Never expose arbitrary upstream exception text, URLs or response bodies.
const safeErrors=errors=>[...new Set((Array.isArray(errors)?errors:[]).map(e=>/^REFERENCE_[A-Z0-9_]{1,80}$/.test(e)?e:/timeout|abort/i.test(String(e))?'REFERENCE_TIMEOUT':'REFERENCE_FETCH_FAILED'))].slice(0,8);
// Only selected meals in the committed plan, never all research candidates.
export function selectedMealReferences(p){
 const events=[...(p.world.events||[])];
 for(const step of p.eventPlan?.steps||[])for(const [path,put,value] of step.patch||[]){
  if(put&&path[0]==='events'){if(path.length===1&&Array.isArray(value))events.push(...value);else if(path.length===2&&value?.type)events.push(value);}
 }
 const selected=events.filter(e=>e.type==='expense'&&e.category==='meal'&&e.food?.localDish&&e.time>=p.world.now-86400000).map(e=>({...e,type:'meal_finished',mealId:e.id,meal:e.food.meal,location:e.food.cityId||e.food.location}));
 return collectionInventory({...p,world:{...p.world,events:selected,publicationJobs:[]}},'meal',Infinity).sort((a,b)=>a.firstSeenAt-b.firstSeenAt);
}
const boundedLookup=row=>{const deadline=AbortSignal.timeout(8000);return collectionReference(row,{fetcher:(url,init)=>fetch(url,{...init,signal:AbortSignal.any([deadline,init.signal].filter(Boolean))})});};
export function mealReferenceCache({bucket,lookup=boundedLookup,now=Date.now}){
 const key=id=>prefix+id+'.json',audit=id=>'reference-audit/meal/'+id+'.json';
 const readJson=async k=>{const o=await bucket.get(k);return o?o.json():null;};
 async function read(id){
  let c;try{c=await readJson(key(id));}catch{}
  if(!c||c.expiresAt<=now()||!c.photos?.length)return {photos:[],errors:c?.status==='failed'?['REFERENCE_PREPARATION_FAILED',...safeErrors(c.errors)]:['REFERENCE_NOT_PREPARED'],preparedAt:c?.at||null};
  try{const photos=c.photos.map(({data,...p})=>({...p,bytes:Buffer.from(data,'base64')}));if(!photos.every(p=>p.bytes.length<=1024*1024&&referenceMime(p.bytes)===p.mimeType&&hash(p.bytes)===p.sha256))throw Error();return {photos,errors:[],preparedAt:c.at};}catch{return {photos:[],errors:['REFERENCE_CACHE_INVALID']};}
 }
 async function prepare(row){
  const old=await readJson(key(row.id));if(old?.expiresAt>now()&&(old.photos?.length||old.lookupVersion===lookupVersion&&old.retryAt>now()))return;
  const r=await lookup(row),at=now(),photos=r.photos.map(({bytes,...p})=>({...p,sha256:hash(bytes),data:Buffer.from(bytes).toString('base64')}));
  const record={id:row.id,name:row.name,at,expiresAt:at+ttl,retryAt:at+5*60000,status:photos.length?'ready':'failed',photos,errors:r.errors,lookupVersion};
  await bucket.put(key(row.id),JSON.stringify(record),{httpMetadata:{contentType:'application/json'}});
  await bucket.put(audit(row.id),JSON.stringify({...record,photos:photos.map(({data,...p})=>p)}),{httpMetadata:{contentType:'application/json'}});
 }
 async function remove(id,reason){
  const c=await readJson(key(id))||await readJson('reference-photos/meal-v1/'+id+'.json');if(c){await bucket.put(audit(id),JSON.stringify({...c,photos:c.photos.map(({data,bytes,...p})=>p),deletedAt:now(),deleteReason:reason}),{httpMetadata:{contentType:'application/json'}});await bucket.delete(key(id));}
  await bucket.delete('reference-photos/meal-v1/'+id+'.json');
 }
 async function finish(id,image){
  // Do not discard retry evidence until both saved artifacts really read back.
  const [original,thumbnail]=await Promise.all([bucket.get(image.src.replace(/^\//,'')),bucket.get(image.thumbnail.replace(/^\//,''))]);
  if(!original||!thumbnail)throw Error('COLLECTION_ARTIFACT_READBACK_REQUIRED');
  const [a,b]=await Promise.all([original.arrayBuffer(),thumbnail.arrayBuffer()]);
  if(hash(Buffer.from(a))!==image.sha256||!b.byteLength||referenceMime(Buffer.from(b))!=='image/jpeg')throw Error('COLLECTION_ARTIFACT_READBACK_FAILED');
  await remove(id,'artwork-verified');
 }
 async function sweep(drawn=new Map()){
  // Bounded page, with a persisted cursor: no new cron and no full-bucket scan.
  const cursorKey='reference-maintenance/cursor.json',state=await readJson(cursorKey);
  const list=await bucket.list({prefix:'reference-photos/',limit:32,...(state?.cursor?{cursor:state.cursor}:{})});
  for(const o of list.objects){const id=/meal-v[12]\/([a-f0-9]{32})\.json$/.exec(o.key)?.[1];if(!id)continue;
   if(drawn.has(id)){try{await finish(id,drawn.get(id));}catch{/* retain evidence until artifacts are readable */}continue;}
   const c=await readJson(o.key);if(c&&(c.expiresAt||c.at+ttl)<=now()){if(o.key===key(id))await remove(id,'expired');else await bucket.delete(o.key);}
  }
  await bucket.put(cursorKey,JSON.stringify({cursor:list.truncated?list.cursor:null}));
 }
 return {read,prepare,finish,sweep};
}

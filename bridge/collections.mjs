// Pure projection of committed facts; never called from minute planning.
import {createHash} from 'node:crypto';
export const collectionKinds=['meal','soda'];
export const collectionId=(world,kind,key)=>createHash('sha256').update(world+'\n'+kind+'\n'+key).digest('hex').slice(0,32);
const normalize=s=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
export function collectionInventory(payload,kind,now=Date.now()){
 if(!collectionKinds.includes(kind))throw Error('INVALID_COLLECTION_KIND');
 const world=payload.world,found=new Map(),seen=new Set();
 const add=e=>{
  if(!Number.isFinite(e.time)||e.time>now)return;
  let food,key,occurrence,localDish=false;
  if(kind==='meal'){
   if(e.type!=='meal_finished')return;food=e.food||{};localDish=food.localDish===true&&!!food.name&&/^https:\/\//.test(food.source||'');
   // Generic simulated meals remain world facts, but are not collectible dishes.
   if(!localDish)return;
   const scope=food.scope==='region'&&food.region?'region:'+normalize(food.country)+':'+normalize(food.region):'city:'+(food.cityId||e.location||'unknown');
   key=localDish?scope+':'+normalize(food.name):'ordinary:'+normalize(food.name||food.zh||e.meal||'餐點');
   occurrence=e.mealId||[e.day,e.meal,e.time,e.location].join(':');
  }else{
   if(e.type!=='expense'||e.category!=='soda'||!e.soda?.id)return;food=e.soda;key=String(food.id);occurrence=e.id||e.purchaseId||[e.day,e.time,key].join(':');
  }
  const id=collectionId(world.publicationWorldId,kind,key),eventKey=kind+':'+occurrence;
  if(seen.has(eventKey))return;seen.add(eventKey);
  let row=found.get(id);
  if(!row){row={id,kind,identity:key,name:food.name||food.zh||({breakfast:'早餐',lunch:'午餐',dinner:'晚餐'}[e.meal]||'餐點'),localDish,sketchEligible:kind==='soda'||localDish,source:food.source||null,scope:food.scope||null,region:food.region||null,country:food.country||e.country||null,brand:food.brand||null,flavour:food.flavour||null,summary:food.summary||null,occurrences:[]};found.set(id,row);}
  row.occurrences.push({key:eventKey,time:e.time,day:e.day||null,meal:e.meal||null,location:e.location||food.cityId||null});
 };
 for(const e of world.events||[])add(e);
 for(const job of world.publicationJobs||[])for(const e of job.input?.events||[])add(e);
 return [...found.values()].map(r=>({...r,occurrences:r.occurrences.sort((a,b)=>b.time-a.time),count:r.occurrences.length,firstSeenAt:Math.min(...r.occurrences.map(e=>e.time)),lastSeenAt:Math.max(...r.occurrences.map(e=>e.time))})).sort((a,b)=>b.lastSeenAt-a.lastSeenAt||a.id.localeCompare(b.id));
}

import {env} from 'cloudflare:workers';
import {collectionEventService} from '../bridge/collection-events.mjs';
import {footprintEvents} from './footprint-events';
import {mealReferenceCache} from '../bridge/meal-reference-cache.mjs';
import {sodaReferenceCache} from '../bridge/soda-reference.mjs';
import {footprintReferenceCache} from '../bridge/footprint-reference.mjs';
import {committed} from './runtime';
import {publishCompletedSketches,drawingSketches} from '../bridge/sketch-lifecycle.mjs';
export const collectionEvents=(kind:string)=>{
 const reference=async(row:any)=>{const r=await(kind==='meal'?mealReferenceCache({bucket:env.BUCKET}):sodaReferenceCache({bucket:env.BUCKET})).read(row.id);return {ready:r.photos.length>0,errors:r.errors};};
 const service=collectionEventService({db:env.DB,bucket:env.BUCKET,kind,ready:async(row:any)=>(await reference(row)).ready,reference,siteOrigin:(env as any).BACKGROUND_TICK_ORIGIN});
 return {...service,status:async(p?:any)=>service.status(p||await committed())};
};
export async function processSketchEvents(p:any){
 // Completion releases prepared art locally; it never starts a second AI job.
 await Promise.allSettled(['meal','soda','footprint'].map(onlyKind=>publishCompletedSketches({db:env.DB,bucket:env.BUCKET,p,onlyKind}).catch(()=>console.log('sketch-release-pending:'+onlyKind))));
 // Independent delivery domains; one failure cannot starve the others or roll back the world.
 // Dispatch immediately. Reference acquisition belongs to the native drawing task,
 // rather than a second downloader which must finish before the task can start.
 const results=await Promise.allSettled([footprintEvents().process(p),collectionEvents('meal').process(p),collectionEvents('soda').process(p),sweepSavedReferences(p)]);
 for(const r of results)if(r.status==='rejected')console.log('sketch-event-delivery-pending');
}
async function sweepSavedReferences(p:any){
 // Retain bounded cleanup of optional/older caches; this never downloads photos.
 const db=env.DB,bucket=env.BUCKET;if(!db||!bucket)return;
 await Promise.allSettled(['meal','soda','footprint'].map(async kind=>{
  const cache=kind==='meal'?mealReferenceCache({bucket:env.BUCKET}):kind==='soda'?sodaReferenceCache({bucket:env.BUCKET}):footprintReferenceCache({bucket:env.BUCKET});
  const prefix=kind==='footprint'?'footprint:':'collection:'+kind+':';
  const records=await db.prepare('SELECT id,value FROM hunem_runtime WHERE id LIKE ?').bind(prefix+'%').all<any>();
  const drawn=new Map((records.results||[]).map((r:any)=>[r.id.slice(prefix.length),JSON.parse(r.value)]));
  const rows=await drawingSketches(db,p,kind);
  await cache.sweep(drawn,new Set(rows.filter((r:any)=>!drawn.has(r.id)).map((r:any)=>r.id)));
 }));
}

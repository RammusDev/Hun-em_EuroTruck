import {env} from 'cloudflare:workers';
import {collectionEventService} from '../bridge/collection-events.mjs';
import {footprintEvents} from './footprint-events';
import {prepareFootprintReferences} from './footprints';
import {prepareMealReferences,prepareSodaReferences} from './collections';
import {mealReferenceCache} from '../bridge/meal-reference-cache.mjs';
import {sodaReferenceCache} from '../bridge/soda-reference.mjs';
import {committed} from './runtime';
import {publishCompletedSketches} from '../bridge/sketch-lifecycle.mjs';
export const collectionEvents=(kind:string)=>{
 const reference=async(row:any)=>{const r=await(kind==='meal'?mealReferenceCache({bucket:env.BUCKET}):sodaReferenceCache({bucket:env.BUCKET})).read(row.id);return {ready:r.photos.length>0,errors:r.errors};};
 const service=collectionEventService({db:env.DB,bucket:env.BUCKET,kind,ready:async(row:any)=>(await reference(row)).ready,reference});
 return {...service,status:async(p?:any)=>service.status(p||await committed())};
};
export async function processSketchEvents(p:any){
 // Completion releases prepared art locally; it never starts a second AI job.
 await Promise.allSettled(['meal','soda','footprint'].map(onlyKind=>publishCompletedSketches({db:env.DB,bucket:env.BUCKET,p,onlyKind}).catch(()=>console.log('sketch-release-pending:'+onlyKind))));
 // Independent delivery domains; one failure cannot starve the others or roll back the world.
 const meal=async()=>{try{await prepareMealReferences(p);}catch{console.log('meal-reference-preparation-pending');}return collectionEvents('meal').process(p);};
 const soda=async()=>{try{await prepareSodaReferences(p);}catch{console.log('soda-reference-preparation-pending');}return collectionEvents('soda').process(p);};
 const footprint=async()=>{try{await prepareFootprintReferences(p);}catch{console.log('footprint-reference-preparation-pending');}return footprintEvents().process(p);};
 const results=await Promise.allSettled([footprint(),meal(),soda()]);
 for(const r of results)if(r.status==='rejected')console.log('sketch-event-delivery-pending');
}

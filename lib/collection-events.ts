import {env} from 'cloudflare:workers';
import {collectionEventService} from '../bridge/collection-events.mjs';
import {footprintEvents} from './footprint-events';
import {prepareMealReferences} from './collections';
import {mealReferenceCache} from '../bridge/meal-reference-cache.mjs';
export const collectionEvents=(kind:string)=>collectionEventService({db:env.DB,bucket:env.BUCKET,kind,...(kind==='meal'?{ready:async(row:any)=>(await mealReferenceCache({bucket:env.BUCKET}).read(row.id)).photos.length>0}:{})});
export async function processSketchEvents(p:any){
 // Independent delivery domains; one failure cannot starve the others or roll back the world.
 const meal=async()=>{try{await prepareMealReferences(p);}catch{console.log('meal-reference-preparation-pending');}return collectionEvents('meal').process(p);};
 const results=await Promise.allSettled([footprintEvents().process(p),meal(),collectionEvents('soda').process(p)]);
 for(const r of results)if(r.status==='rejected')console.log('sketch-event-delivery-pending');
}

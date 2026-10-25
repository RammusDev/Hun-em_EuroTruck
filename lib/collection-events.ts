import {env} from 'cloudflare:workers';
import {collectionEventService} from '../bridge/collection-events.mjs';
import {footprintEvents} from './footprint-events';
export const collectionEvents=(kind:string)=>collectionEventService({db:env.DB,bucket:env.BUCKET,kind});
export async function processSketchEvents(p:any){
 // Independent delivery domains; one failure cannot starve the others or roll back the world.
 const results=await Promise.allSettled([footprintEvents().process(p),collectionEvents('meal').process(p),collectionEvents('soda').process(p)]);
 for(const r of results)if(r.status==='rejected')console.log('sketch-event-delivery-pending');
}

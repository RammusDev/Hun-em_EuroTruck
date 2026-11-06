import {env} from 'cloudflare:workers';
import {prepareSketchWork,sketchKinds} from '../bridge/sketch-work.mjs';
import {collectionRows,claimCollection} from './collections';
import {footprints,claimFootprint} from './footprints';
import {mealReferenceCache} from '../bridge/meal-reference-cache.mjs';
import {sodaReferenceCache} from '../bridge/soda-reference.mjs';
import {footprintReferenceCache} from '../bridge/footprint-reference.mjs';
export async function prepareSketch(kind:string,id?:string){
 if(!sketchKinds.includes(kind)||id!==undefined&&!/^[a-f0-9]{32}$/.test(id))throw Error('INVALID_SKETCH');
 const bucket=env.BUCKET as R2Bucket;
 const rows=kind==='footprint'?await footprints(true):await collectionRows(kind,undefined,true);
 return prepareSketchWork({db:env.DB,kind,id,rows,claim:(resolved:string)=>kind==='footprint'?claimFootprint(resolved):claimCollection(kind,resolved),
  reference:(resolved:string)=>(kind==='footprint'?footprintReferenceCache({bucket}):kind==='meal'?mealReferenceCache({bucket}):sodaReferenceCache({bucket})).read(resolved)});
}

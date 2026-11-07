import {env} from 'cloudflare:workers';
import {prepareSketchWork,sketchKinds,readSketchReference,ensureSketchReference} from '../bridge/sketch-work.mjs';
import {collectionRows,claimCollection} from './collections';
import {footprints,claimFootprint} from './footprints';
export async function prepareSketch(kind:string,id?:string){
 if(!sketchKinds.includes(kind)||id!==undefined&&!/^[a-f0-9]{32}$/.test(id))throw Error('INVALID_SKETCH');
 const bucket=env.BUCKET as R2Bucket;
 const rows=kind==='footprint'?await footprints(true):await collectionRows(kind,undefined,true);
 return prepareSketchWork({db:env.DB,kind,id,rows,claim:(resolved:string)=>kind==='footprint'?claimFootprint(resolved):claimCollection(kind,resolved),
  reference:(resolved:string)=>ensureSketchReference({bucket,kind,row:rows.find((r:any)=>r.id===resolved)})});
}
export const sketchReference=(kind:string,id:string)=>readSketchReference({bucket:env.BUCKET,kind,id});

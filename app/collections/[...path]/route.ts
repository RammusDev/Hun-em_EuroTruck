import {requireReader} from '../../../lib/world-auth';
import {collectionObject} from '../../../lib/collections';
import {readerImageResponse} from '../../../bridge/reader-image.mjs';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{await requireReader(req);const key=new URL(req.url).pathname.slice(1),obj=await collectionObject(key);if(!obj)return new Response('Not found',{status:404});return await readerImageResponse(req,obj,key);}catch(e:any){return new Response('無法取得收藏圖片',{status:e.status||403,headers:{'Cache-Control':'no-store'}});}}

import {requireReader} from '../../../lib/world-auth';
import {collectionObject} from '../../../lib/collections';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{await requireReader(req);const key=new URL(req.url).pathname.slice(1),obj=await collectionObject(key);if(!obj)return new Response('Not found',{status:404});return new Response(obj.body,{headers:{'Content-Type':key.endsWith('.png')?'image/png':'image/jpeg','Cache-Control':'private,no-store','Vary':'Cookie'}});}catch(e:any){return new Response('無法取得收藏圖片',{status:e.status||403,headers:{'Cache-Control':'no-store'}});}}

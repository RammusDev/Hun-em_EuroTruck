import {committed,getObject} from '../../../lib/runtime';
import {requireReader} from '../../../lib/world-auth';
import {readerImageResponse} from '../../../bridge/reader-image.mjs';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{await requireReader(req);const key=new URL(req.url).pathname.slice(1),p=await committed();const visible=p.world.diaries.some((d:any)=>d.illustrations?.some((a:any)=>a.src==='/'+key));if(!visible)return new Response('Not published',{status:404});const obj=await getObject(key);return obj?await readerImageResponse(req,obj,key):new Response('Not found',{status:404});}catch(e:any){return Response.json({error:e.status===401?'請先登入':'無法取得圖片'},{status:e.status||403,headers:{'Cache-Control':'no-store'}});}}

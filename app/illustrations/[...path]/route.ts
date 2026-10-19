import {getObject} from '../../../lib/runtime';
import {requireReader} from '../../../lib/world-auth';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{await requireReader(req);const key=new URL(req.url).pathname.slice(1);if(!/^illustrations\/[a-z0-9-]+\.png$/.test(key))return new Response('Not found',{status:404});const obj=await getObject(key);return obj?new Response(obj.body,{headers:{'Content-Type':'image/png','Cache-Control':'private,no-store'}}):new Response('Not found',{status:404});}catch(e:any){return Response.json({error:e.status===401?'請先登入':'無法取得圖片'},{status:e.status||403,headers:{'Cache-Control':'no-store'}});}}

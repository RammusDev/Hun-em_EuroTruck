import {transaction,getObject} from '../../../lib/runtime';
export const dynamic='force-dynamic';
export async function GET(req:Request){const key=new URL(req.url).pathname.slice(1);const visible=await transaction(async p=>p.world.diaries.some((d:any)=>d.illustrations?.some((a:any)=>a.src==='/'+key)),false);if(!visible)return new Response('Not published',{status:404});const obj=await getObject(key);return obj?new Response(obj.body,{headers:{'Content-Type':'image/png','Cache-Control':'private,max-age=86400'}}):new Response('Not found',{status:404});}

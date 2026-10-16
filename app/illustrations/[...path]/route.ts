import {getObject} from '../../../lib/runtime';
export const dynamic='force-dynamic';
export async function GET(req:Request){const key=new URL(req.url).pathname.slice(1);if(!/^illustrations\/[a-z0-9-]+\.png$/.test(key))return new Response('Not found',{status:404});const obj=await getObject(key);return obj?new Response(obj.body,{headers:{'Content-Type':'image/png','Cache-Control':'private,max-age=86400'}}):new Response('Not found',{status:404});}

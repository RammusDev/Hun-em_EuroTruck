import {requireReader} from '../../lib/world-auth';
import html from '../../private/journey.html?raw';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{await requireReader(req);const page=html.replace('</header>','<a href="/account" style="font-size:14px;white-space:nowrap">帳號／登出</a></header>');return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private,no-store'}});}catch(e:any){return new Response(e.status===401?'請先使用Google登入':'尚未取得觀看許可',{status:e.status||403,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}}

import {transaction,seed,stateView,putObject,research,engine} from '../../../lib/runtime';
import {publication} from '../../../lib/publication';
export const dynamic='force-dynamic';
const result=(value:any,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{
 const route=new URL(req.url).pathname;
 if(route==='/api/state')return result(await transaction(async p=>stateView(p)));
 if(route==='/api/health')return result({service:'hun-em',clock:'Europe/Berlin',storage:'D1 + R2'});
 if(route==='/api/export')return result(await transaction(async p=>p,false));
 if(route==='/api/publication')return result(await transaction(p=>publication(p,'status',{})));
 if(route==='/api/research')return result(await transaction(async p=>{await research(p);return {researched:true};}));
 if(route==='/api/debug')return result(await transaction(async p=>({version:1,world:p.world,routes:p.routes,cloud:true}),false));
 return result({error:'Not found'},404);
 }catch(e:any){return result({error:e.message},e.status||500);}}
export async function POST(req:Request){try{
 const u=new URL(req.url),route=u.pathname;
 if(route==='/api/import')return result(await seed(await req.json()));
 if(route==='/api/object')return result(await putObject(u.searchParams.get('key')||'',await req.arrayBuffer()));
 if(route==='/api/publication'){const body:any=await req.json();return result(await transaction(p=>publication(p,body.op,body)));}
 if(route==='/api/retry-route'){if(req.headers.get('origin')!==u.origin)return result({error:'Invalid origin'},403);return result(await transaction(async p=>{await engine.retryPendingRoute(p.world,engine.getRoute);return stateView(p);}));}
 if(route==='/api/debug')return result(await transaction(async p=>({version:1,world:p.world,routes:p.routes,cloud:true}),false));
 if(route==='/api/control')return result({error:'雲端正式世界不提供快轉或變速'},403);
 return result({error:'Not found'},404);
 }catch(e:any){return result({error:e.message},e.status||400);}}

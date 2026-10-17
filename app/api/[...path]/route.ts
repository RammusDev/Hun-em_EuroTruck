import {transaction,seed,stateView,putObject,research,engine,committed,Conflict} from '../../../lib/runtime';
import {publication} from '../../../lib/publication';
export const dynamic='force-dynamic';
const result=(value:any,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{
 const route=new URL(req.url).pathname;
 if(route==='/api/state'){try{return result(await transaction(async p=>stateView(p)));}catch(e){if(!(e instanceof Conflict))throw e;return result({...stateView(await committed()),syncPending:true});}}
 if(route==='/api/health')return result({service:'hun-em',clock:'Europe/Berlin',storage:'D1 + R2'});
 if(route==='/api/worker')return result(await transaction(async p=>({version:2,now:p.world.now,day:engine.realDay(Date.now()),syncPending:Date.now()-p.world.realAt>60000,...await publication(p,'verify',{})})));
 if(route==='/api/export')return result(await committed());
 if(route==='/api/config')return result(JSON.parse((await committed()).files['/hunem/assets/language-learning.json']));
 if(route==='/api/config')return result(await transaction(async p=>JSON.parse(p.files['/hunem/assets/language-learning.json']),false));
 if(route==='/api/publication')return result(await transaction(p=>publication(p,'status',{})));
 if(route==='/api/research')return result(await transaction(async()=>({researched:true})));
 if(route==='/api/debug')return result(await transaction(async p=>({version:1,world:p.world,routes:p.routes,cloud:true}),false));
 return result({error:'Not found'},404);
 }catch(e:any){return result({error:e.message},e.status||500);}}
export async function POST(req:Request){try{
 const u=new URL(req.url),route=u.pathname;
 if(req.headers.get('origin')&&req.headers.get('origin')!==u.origin)return result({error:'Invalid origin'},403);
 if(route==='/api/config'){
  const config:any=await req.json();return result(await transaction(async p=>{
   const file='/hunem/assets/language-learning.json',current=JSON.parse(p.files[file]);
   for(const lang of ['en','de','ja']){const rows=config.languages?.[lang]?.grammar;if(!Array.isArray(rows))throw Error('教材結構不完整');for(const g of current.languages[lang].grammar){const next=rows.find((n:any)=>n.id===g.id);if(!next&&g.teaching?.taught)throw Error('不能刪除已教教材，請改為停用');if(next)next.teaching=structuredClone(g.teaching);}}
   engine.writeFileSync(file,JSON.stringify(config,null,2));engine.readLearning();engine.syncTeaching(p.world.diaries);return {updated:true,levels:Object.fromEntries(['en','de','ja'].map(l=>[l,config.languages[l].targetLevel]))};
  }));
 }
 if(req.headers.get('origin')&&req.headers.get('origin')!==u.origin)return result({error:'Invalid origin'},403);
 if(route==='/api/config'){
  const config:any=await req.json();return result(await transaction(async p=>{
   const file='/hunem/assets/language-learning.json',current=JSON.parse(p.files[file]);
   for(const lang of ['en','de','ja']){const rows=config.languages?.[lang]?.grammar;if(!Array.isArray(rows))throw Error('教材結構不完整');for(const g of current.languages[lang].grammar){const next=rows.find((n:any)=>n.id===g.id);if(!next&&g.teaching?.taught)throw Error('不能刪除已教教材，請改為停用');if(next)next.teaching=structuredClone(g.teaching);}}
   engine.writeFileSync(file,JSON.stringify(config,null,2));engine.readLearning();engine.syncTeaching(p.world.diaries);return {updated:true,levels:Object.fromEntries(['en','de','ja'].map(l=>[l,config.languages[l].targetLevel]))};
  }));
 }
 if(route==='/api/import')return result(await seed(await req.json()));
 if(route==='/api/object')return result(await putObject(u.searchParams.get('key')||'',await req.arrayBuffer()));
 if(route==='/api/publication'){const body:any=await req.json();return result(await transaction(p=>publication(p,body.op,body)));}
 if(route==='/api/retry-route'){if(req.headers.get('origin')!==u.origin)return result({error:'Invalid origin'},403);return result(await transaction(async p=>{await engine.retryPendingRoute(p.world,engine.getRoute);return stateView(p);}));}
 if(route==='/api/debug')return result(await transaction(async p=>({version:1,world:p.world,routes:p.routes,cloud:true}),false));
 if(route==='/api/control')return result({error:'雲端正式世界不提供快轉或變速'},403);
 return result({error:'Not found'},404);
 }catch(e:any){return result({error:e.message},e.status||400);}}

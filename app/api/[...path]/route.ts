import {transaction,seed,stateView,putObject,research,engine,committed,Conflict,resetWorld,correctStart,updateDrinkPreferences,binaryHash} from '../../../lib/runtime';
import {publication} from '../../../lib/publication';
import {journalRecovery} from '../../../lib/journal-recovery.mjs';
import {env} from 'cloudflare:workers';
import {worldActor} from '../../../lib/world-auth';
// @ts-ignore
import {authorizeWorld,publicReaderView} from '../../../lib/world-policy.mjs';
export const dynamic='force-dynamic';
const result=(value:any,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{
 const route=new URL(req.url).pathname;
 const role=authorizeWorld(await worldActor(req),'GET',route);
 const view=(p:any)=>role==='reader'?publicReaderView(stateView(p)):{...stateView(p),viewerRole:role};
 if(route==='/api/state')return result({...view(await committed()),syncPending:false});
 if(route==='/api/state'){try{return result(await transaction(async p=>view(p)));}catch(e){if(!(e instanceof Conflict))throw e;return result({...view(await committed()),syncPending:true});}}
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
 const actor=await worldActor(req);authorizeWorld(actor,'POST',route);
 if(actor?.role==='service'&&route==='/api/object'&&!/^generated\/hunem-\d{4}-\d{2}-\d{2}-[a-f0-9]{8}\/[a-z0-9-]+\.png$/.test(u.searchParams.get('key')||''))return result({error:'Service upload scope denied'},403);
 if(actor?.role!=='service'&&req.headers.get('origin')!==u.origin)return result({error:'Invalid origin'},403);
 if(req.headers.get('origin')&&req.headers.get('origin')!==u.origin)return result({error:'Invalid origin'},403);
 if(route==='/api/update-drink-preferences')return result(await updateDrinkPreferences());
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
 if(route==='/api/reset-world')return result(await resetWorld(await req.json()));
 if(route==='/api/correct-start')return result(await correctStart(await req.json()));
 if(route==='/api/object')return result(await putObject(u.searchParams.get('key')||'',await req.arrayBuffer()));
 if(route==='/api/publication'){
  const body:any=await req.json();
  if(body.op==='metrics')return result(await publication(await committed(),'metrics',body));
  if(typeof body.op==='string'&&body.op.startsWith('recovery-')){
   const backup=async(key:string,bytes:string,digest:string)=>{const bucket=env.BUCKET as R2Bucket,old=await bucket.get(key);if(old){if(engine.digest(await old.text())!==digest)throw new Conflict('Recovery backup already exists with different state');}else await bucket.put(key,bytes,{httpMetadata:{contentType:'application/json'}});};
   const imageStore={get:(key:string)=>(env.BUCKET as R2Bucket).get(key),hash:binaryHash,otherHash:(sha:string,key:string)=>(env.DB as D1Database).prepare('SELECT path FROM hunem_objects WHERE sha256=? AND path<>?').bind(sha,key).first()};
   return result(await transaction(p=>journalRecovery(p,body,{engine,backup,imageStore}),false,body.op==='recovery-commit',{skipCommit:(r:any)=>r.valid===false||r.reused===true}));
  }
  return result(await transaction(p=>publication(p,body.op,body)));
 }
 if(route==='/api/retry-route'){if(req.headers.get('origin')!==u.origin)return result({error:'Invalid origin'},403);return result(await transaction(async p=>{await engine.retryPendingRoute(p.world,engine.getRoute);return stateView(p);}));}
 if(route==='/api/debug')return result(await transaction(async p=>({version:1,world:p.world,routes:p.routes,cloud:true}),false));
 if(route==='/api/control')return result({error:'雲端正式世界不提供快轉或變速'},403);
 return result({error:'Not found'},404);
 }catch(e:any){return result({error:e.message},e.status||400);}}

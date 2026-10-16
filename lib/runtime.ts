import {env} from 'cloudflare:workers';
import {createHash} from 'node:crypto';
import * as core from './core.mjs';
import {advanceCloud} from '../bridge/advance.mjs';
const db=()=>env.DB as D1Database,bucket=()=>env.BUCKET as R2Bucket;
const root='/hunem/data',json=(x:any)=>JSON.stringify(x);
export const binaryHash=(x:any)=>createHash('sha256').update(x).digest('hex');
const hash=(x:any)=>binaryHash(Buffer.isBuffer(x)||typeof x==='string'?x:json(x));
let queue:Promise<any>=Promise.resolve();
export class Conflict extends Error {status=409;}
export async function transaction(fn:(p:any)=>Promise<any>,advance=true){
 const run=async()=>{
  const lease=crypto.randomUUID(),now=Date.now(),row=await db().prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING *').bind(lease,now+180000,'world',now).first<any>();
  if(!row)throw new Conflict('世界正在同步，請稍後重試');
  try{
   const body=await bucket().get(JSON.parse(row.value).key);if(!body)throw Error('世界快照遺失，禁止建立新世界');
   const p=await body.json<any>();core.hydrate(p.files||{});
   process.env.GOOGLE_MAPS_API_KEY=String((env as any).GOOGLE_MAPS_API_KEY||'');process.env.GOOGLE_MAPS_BROWSER_KEY=String((env as any).GOOGLE_MAPS_BROWSER_KEY||'');
   if(advance)await advanceCloud(p,core);
   const result=await fn(p);if(!advance)return result;Object.assign(p.files,core.changes());
   for(const key of Object.keys(p.files))if(key.endsWith('.tmp'))delete p.files[key];
   const revision=row.revision+1,key=`snapshots/${String(revision).padStart(10,'0')}-${lease}.json`,bytes=json(p);
   await bucket().put(key,bytes,{httpMetadata:{contentType:'application/json'}});
   const updated=await db().prepare('UPDATE hunem_runtime SET value=?,revision=?,updated_at=?,lease=NULL,lease_until=NULL WHERE id=? AND revision=? AND lease=? AND lease_until>=?').bind(json({key,sha256:hash(bytes)}),revision,Date.now(),'world',row.revision,lease,Date.now()).run();
   if(updated.meta.changes!==1)throw new Conflict('世界交易鎖已過期，未提交');
   const previous=JSON.parse(row.value).key;if(previous.startsWith('snapshots/')&&!previous.startsWith('snapshots/import-'))await bucket().delete(previous);
   if(Math.floor(now/3600000)!==Math.floor(row.updated_at/3600000)){await bucket().put('backups/'+new Date(now).toISOString().slice(0,13)+'.json',bytes);const list=await bucket().list({prefix:'backups/'});for(const item of list.objects)if(item.uploaded.getTime()<now-7*86400000)await bucket().delete(item.key);}
   return result;
  }finally{await db().prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind('world',lease).run();}
 };
 const next=queue.then(run);queue=next.catch(()=>{});return next;
}
export async function seed(p:any){
 if(p?.world?.version!==1||p.world.speed!==1||!p.files?.['/hunem/assets/language-learning.json'])throw Error('匯入資料不完整或非真實時間世界');
 if(await db().prepare('SELECT id FROM hunem_runtime WHERE id=?').bind('world').first())throw new Conflict('世界已匯入，不允許覆寫');
 const key='snapshots/import-'+hash(json(p))+'.json';await bucket().put(key,json(p),{httpMetadata:{contentType:'application/json'}});
 await db().prepare('INSERT INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,?,?)').bind('world',json({key,sha256:hash(json(p))}),0,Date.now()).run();
 return {seeded:true,worldTime:p.world.now,diaries:p.world.diaries.length,balance:p.world.balance};
}
export function stateView(p:any){return {...core.snapshot(p.world),diaries:p.world.diaries,cities:core.cities,album:core.albumFromWorld(p.world,core.cities),googleKey:String((env as any).GOOGLE_MAPS_BROWSER_KEY||''),adminToken:'private-owner',cloud:true};}
export async function putObject(key:string,bytes:ArrayBuffer){
 if(!/^(illustrations\/[a-z0-9-]+\.png|generated\/hunem-\d{4}-\d{2}-\d{2}-[a-f0-9]{8}\/[a-z0-9-]+\.png|archive\/[a-zA-Z0-9_./-]+)$/.test(key)||key.includes('..'))throw Error('無效物件路徑');
 const digest=hash(Buffer.from(bytes)),old=await db().prepare('SELECT sha256 FROM hunem_objects WHERE path=?').bind(key).first<any>();if(old&&old.sha256!==digest){const existing=await bucket().get(key);if(!existing||binaryHash(Buffer.from(await existing.arrayBuffer()))!==digest)throw new Conflict('物件已存在且內容不同，禁止覆寫');await db().prepare('UPDATE hunem_objects SET sha256=? WHERE path=?').bind(digest,key).run();}
 await bucket().put(key,bytes,{httpMetadata:{contentType:key.endsWith('.png')?'image/png':'application/octet-stream'}});
 await db().prepare('INSERT OR IGNORE INTO hunem_objects(path,sha256,bytes,created_at) VALUES(?,?,?,?)').bind(key,digest,bytes.byteLength,Date.now()).run();return {key,sha256:digest,bytes:bytes.byteLength};
}
export async function getObject(key:string){return bucket().get(key);}
export async function research(p:any){const work=core.createTopicResearcher(root);await work.schedule(p.world);p.world.localTopicCache=work.entries;}
export const engine=core;

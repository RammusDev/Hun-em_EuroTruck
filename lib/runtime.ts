import {env} from 'cloudflare:workers';
import {createHash} from 'node:crypto';
import * as core from './core.mjs';
import {advanceCloud} from '../bridge/advance.mjs';
import bundledFiles from '../bridge/static-files.json';
import {browserState} from '../bridge/browser-state.mjs';
const db=()=>env.DB as D1Database,bucket=()=>env.BUCKET as R2Bucket;
const root='/hunem/data',json=(x:any)=>JSON.stringify(x);
export const binaryHash=(x:any)=>createHash('sha256').update(x).digest('hex');
const hash=(x:any)=>binaryHash(Buffer.isBuffer(x)||typeof x==='string'?x:json(x));
let queue:Promise<any>=Promise.resolve();
export class Conflict extends Error {status=409;}
export async function committed(){for(let i=0;i<3;i++){const row=await db().prepare('SELECT value FROM hunem_runtime WHERE id=?').bind('world').first<any>();if(!row)throw new Conflict('世界尚未匯入');const body=await bucket().get(JSON.parse(row.value).key);if(body)return body.json<any>();}throw new Conflict('世界版本切換中，請稍後重試');}
export async function transaction(fn:(p:any)=>Promise<any>,advance=true,commit=advance){
 const run=async()=>{
  const lease=crypto.randomUUID(),now=Date.now(),row=await db().prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING *').bind(lease,now+180000,'world',now).first<any>();
  if(!row)throw new Conflict('世界正在同步，請稍後重試');
  try{
   const body=await bucket().get(JSON.parse(row.value).key);if(!body)throw Error('世界快照遺失，禁止建立新世界');
   const p=await body.json<any>();core.hydrate(p.files||{});
   process.env.GOOGLE_MAPS_API_KEY=String((env as any).GOOGLE_MAPS_API_KEY||'');process.env.GOOGLE_MAPS_BROWSER_KEY=String((env as any).GOOGLE_MAPS_BROWSER_KEY||'');
   if(advance)await advanceCloud(p,core);
   const result=await fn(p);if(!commit)return result;Object.assign(p.files,core.changes());
   for(const key of Object.keys(p.files))if(key.endsWith('.tmp'))delete p.files[key];
   const revision=row.revision+1,key=`snapshots/${String(revision).padStart(10,'0')}-${lease}.json`,bytes=json(p);
   await bucket().put(key,bytes,{httpMetadata:{contentType:'application/json'}});
   const updated=await db().prepare('UPDATE hunem_runtime SET value=?,revision=?,updated_at=?,lease=NULL,lease_until=NULL WHERE id=? AND revision=? AND lease=? AND lease_until>=?').bind(json({key,sha256:hash(bytes)}),revision,Date.now(),'world',row.revision,lease,Date.now()).run();
   if(updated.meta.changes!==1)throw new Conflict('世界交易鎖已過期，未提交');
   const previous=JSON.parse(row.value).key;if(previous.startsWith('snapshots/')&&!previous.startsWith('snapshots/import-'))await bucket().delete(previous);
   if(Math.floor(now/3600000)!==Math.floor(row.updated_at/3600000)){await bucket().put('backups/'+new Date(now).toISOString().slice(0,13)+'.json',bytes);const list=await bucket().list({prefix:'backups/'});for(const item of list.objects)if(!item.key.startsWith('backups/manual-')&&item.uploaded.getTime()<now-7*86400000)await bucket().delete(item.key);}
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
export function stateView(p:any){return browserState({...core.snapshot(p.world),diaries:p.world.diaries,cities:core.cities,album:core.albumFromWorld(p.world,core.cities),googleKey:String((env as any).GOOGLE_MAPS_BROWSER_KEY||''),adminToken:'private-owner',cloud:true});}
export async function putObject(key:string,bytes:ArrayBuffer){
 if(!/^(illustrations\/[a-z0-9-]+\.png|generated\/hunem-\d{4}-\d{2}-\d{2}-[a-f0-9]{8}\/[a-z0-9-]+\.png|archive\/[a-zA-Z0-9_./-]+)$/.test(key)||key.includes('..'))throw Error('無效物件路徑');
 const digest=hash(Buffer.from(bytes)),old=await db().prepare('SELECT sha256 FROM hunem_objects WHERE path=?').bind(key).first<any>();if(old&&old.sha256!==digest){const existing=await bucket().get(key);if(!existing||binaryHash(Buffer.from(await existing.arrayBuffer()))!==digest)throw new Conflict('物件已存在且內容不同，禁止覆寫');await db().prepare('UPDATE hunem_objects SET sha256=? WHERE path=?').bind(digest,key).run();}
 await bucket().put(key,bytes,{httpMetadata:{contentType:key.endsWith('.png')?'image/png':'application/octet-stream'}});
 await db().prepare('INSERT OR IGNORE INTO hunem_objects(path,sha256,bytes,created_at) VALUES(?,?,?,?)').bind(key,digest,bytes.byteLength,Date.now()).run();return {key,sha256:digest,bytes:bytes.byteLength};
}
export async function getObject(key:string){return bucket().get(key);}
export async function research(p:any){const work=core.createTopicResearcher(root);await work.schedule(p.world);p.world.localTopicCache=work.entries;}
export const engine=core;

// Explicit owner maintenance: update only the two reviewed drink preference files.
export async function updateDrinkPreferences(){
 return transaction(async p=>{
  const paths=['/hunem/CHARACTER.md','/hunem/assets/sodas.json'];
  const expected=['ac4cc91119d699d6a3479f788b1ebdd04eb5dd7696baffc47c2170adfc20973b','e297295830e1ee5ec2c726b0ebf6f3eb87411069603a2c961868149827cc4fa9'];
  for(let i=0;i<paths.length;i++){const value=p.files[paths[i]];if(hash(value)!==expected[i]&&value!==(bundledFiles as any)[paths[i]])throw new Conflict('設定已變更，停止覆寫');}
  const backupKey='backups/manual-before-drink-preferences-v2-20261018.json';
  if(!(await bucket().get(backupKey)))await bucket().put(backupKey,json(p),{httpMetadata:{contentType:'application/json'}});
  for(const path of paths)core.writeFileSync(path,(bundledFiles as any)[path]);
  return {updated:true,backupKey,catalogVersion:2,products:JSON.parse((bundledFiles as any)[paths[1]]).products.length,hashes:Object.fromEntries(paths.map(path=>[path,hash((bundledFiles as any)[path])]))};
 },false,true);
}

export async function correctStart(a:any){
 if(a?.expectedWorldId!=='c9181921-e285-4ada-bf6f-c763c678964e')throw Error('INVALID_CORRECTION_REQUEST');
 return transaction(async p=>{
  if(p.startCorrection)return {...p.startCorrection,reused:true};
  if(p.world.publicationWorldId!==a.expectedWorldId)throw new Conflict('世界身份已改變');
  const backupKey='backups/manual-before-home-start-correction-20261018.json';
  if(!(await bucket().get(backupKey)))await bucket().put(backupKey,json(p),{httpMetadata:{contentType:'application/json'}});
  const result=core.correctHomeStart(p.world);p.world.realAt=Date.now();
  p.startCorrection={...result,worldId:p.world.publicationWorldId,at:Date.now(),backupKey};return p.startCorrection;
 },false,true);
}

export async function resetWorld(a:any){
 if(a?.scope!=='all'||!/^[-a-zA-Z0-9]{8,80}$/.test(a.requestId||'')||typeof a.expectedWorldId!=='string')throw Error('INVALID_RESET_REQUEST');
 return transaction(async p=>{
  const existing=p.maintenanceResets?.[a.requestId];if(existing)return {reset:true,...existing,reused:true};
  if(p.world.publicationWorldId!==a.expectedWorldId)throw new Conflict('世界身份已改變，禁止再次重開');
  const backupKey=`backups/manual-before-reset-${a.requestId}.json`;
  if(await bucket().get(backupKey))throw new Conflict('備份名稱已存在，請核對重開結果');
  await bucket().put(backupKey,json(p),{httpMetadata:{contentType:'application/json'}});
  const fresh=core.freshWorldPayload(p,bundledFiles,Date.now(),a.requestId);
  for(const key of Object.keys(p))delete p[key];Object.assign(p,fresh);core.hydrate(p.files);
  return {reset:true,...p.maintenanceResets[a.requestId],backupKey,diaries:0,balance:p.world.balance};
 },false,true);
}

import {env} from 'cloudflare:workers';
import {worldActor} from '../../../lib/world-auth';
import {committed,transaction,engine,stateView} from '../../../lib/runtime';
import {settingsView,previewSetting,saveSetting,diagnosticBundle,hashText,settingsPaths} from '../../../lib/maintenance.mjs';
import {readMonitor} from '../../../lib/monitor-store.mjs';
export const dynamic='force-dynamic';
const reply=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
async function authorize(req:Request){const a=await worldActor(req);if(!a)throw Object.assign(Error('請先登入'),{status:401});if(a.role!=='user'||!a.owner||!a.adminFresh)throw Object.assign(Error('需要擁有者最近30分鐘內登入'),{status:403});if(req.method==='POST'&&req.headers.get('origin')!==new URL(req.url).origin)throw Object.assign(Error('Invalid origin'),{status:403});}
const versionKey=(kind:string,hash:string)=>`maintenance/settings/${kind}/${hash}.txt`;
async function version(kind:string,hash:string){if(!Object.hasOwn(settingsPaths,kind)||!/^[a-f0-9]{64}$/.test(hash||''))throw Object.assign(Error('無效版本'),{status:400});const object=await (env.BUCKET as R2Bucket).get(versionKey(kind,hash));if(!object)throw Object.assign(Error('版本不存在'),{status:404});const text=await object.text();if(hashText(text)!==hash)throw Error('版本檢查失敗');return text;}
export async function GET(req:Request){try{await authorize(req);const u=new URL(req.url),p=await committed();
 if(u.searchParams.get('op')==='version')return reply({text:await version(u.searchParams.get('kind')||'',u.searchParams.get('hash')||'')});
 if(u.searchParams.get('op')==='debug'){const monitor=await readMonitor(p,stateView(p),env);return reply(diagnosticBundle(p,monitor,null,Object.values(env).filter(v=>typeof v==='string')));}
 return reply(settingsView(p));
 }catch(e:any){return reply({error:e.message},e.status||500);}}
async function bodyJson(req:Request){if(!req.headers.get('content-type')?.startsWith('application/json'))throw Object.assign(Error('需使用JSON'),{status:415});const reader=req.body?.getReader();if(!reader)throw Object.assign(Error('缺少內容'),{status:400});const parts=[];let size=0;for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1200000){await reader.cancel();throw Object.assign(Error('內容過大'),{status:413});}parts.push(Buffer.from(r.value));}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
export async function POST(req:Request){try{await authorize(req);const body:any=await bodyJson(req);
 if(body.op==='preview')return reply(previewSetting(await committed(),body));
 if(!['save','restore'].includes(body.op))return reply({error:'未知操作'},400);
 if(body.op==='restore')body.text=await version(body.kind,body.hash);
 const receipt=await transaction(async(p:any)=>saveSetting(p,{...body,action:body.op},{write:engine.writeFileSync,backup:async(kind:string,hash:string,text:string)=>{const bucket=env.BUCKET as R2Bucket,key=versionKey(kind,hash),old=await bucket.get(key);if(old){if(hashText(await old.text())!==hash)throw Error('備份檢查失敗');}else await bucket.put(key,text,{httpMetadata:{contentType:'text/plain;charset=utf-8'}});}}),false,true,{skipCommit:(r:any)=>!r.updated});
 return reply(receipt);
 }catch(e:any){return reply({error:e.message},e.status||400);}}

import {createHash} from 'node:crypto';
import bundled from '../bridge/static-files.json' with {type:'json'};

export const settingsPaths={cities:'/hunem/assets/city-candidates.json',travel:'/hunem/assets/travel-policy.json',character:'/hunem/CHARACTER.md'};
export const hashText=text=>createHash('sha256').update(text).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// City/policy modules historically loaded their bundled defaults at process start.
// Old persisted copies were not active settings; adopt them only after a workshop save.
export const settingText=(p,kind)=>(kind==='character'||p.maintenance?.current?.[kind])?(p.files?.[settingsPaths[kind]]??bundled[settingsPaths[kind]]):bundled[settingsPaths[kind]];
export const travelFields={
 'touring.visitMinutes':[15,180,'每站參觀分鐘'],
 'touring.mealMinutes':[15,90,'旅途中用餐分鐘'],
 'touring.waitMinutes':[0,60,'每段候車分鐘'],
 'touring.departureHour':[8,12,'休假出發時刻'],
 'touring.latestReturnDepartureHour':[16,20,'最晚開始回程時刻'],
 'routeRetryMinutes':[30,180,'道路最長重試間隔（分鐘）'],
 'maxRouteAttemptsPerDay':[1,6,'每日道路查詢上限'],
};
export function settingsView(p){return {resources:Object.keys(settingsPaths).map(kind=>({kind,text:settingText(p,kind),hash:hashText(settingText(p,kind)),revision:p.maintenance?.current?.[kind]||null,applied:p.maintenance?.applied?.[kind]||null})),history:(p.maintenance?.history||[]).slice(-60).reverse(),travelFields};}
export function validateSetting(kind,text,current){
 if(!Object.hasOwn(settingsPaths,kind))fail('未知設定');
 if(typeof text!=='string'||Buffer.byteLength(text)>1024*1024||!text.trim())fail('設定內容為空或過大');
 if(kind==='character'){
  if(text.length<100||text.length>60000)fail('角色設定需為100至60000字');
  // The established identity is fixed; only the writing/life sections are editable here.
  const prefix=s=>s.replaceAll('\r\n','\n').split('## 生活、喜好與相處')[0];
  if(!text.includes('## 生活、喜好與相處')||prefix(text)!==prefix(current))fail('形象、住家與身世為固定設定，請保留原文');
  for(const lang of ['zh','en','de','ja'])if(!new RegExp(`^### diary-closing-${lang}\\s*\\r?\\n\\s*[^#\\s]`,'m').test(text))fail('請保留四語 diary-closing 段落');
  return text.replaceAll('\r\n','\n');
 }
 let next,old;try{next=JSON.parse(text);old=JSON.parse(current);}catch{fail('JSON格式錯誤');}
 if(kind==='cities'){
  if(!Array.isArray(next.cities)||next.cities.length!==old.cities.length)fail('此頁僅編輯既有城市啟用狀態與抽選權重');
  const restored=structuredClone(next);
  for(let i=0;i<old.cities.length;i++){
   const c=next.cities[i],before=old.cities[i];
   if(!c||c.id!==before.id||typeof c.enabled!=='boolean'||!Number.isFinite(c.weight)||c.weight<=0||c.weight>100)fail('城市啟用狀態或權重無效');
   if(c.id==='munich'&&!c.enabled)fail('慕尼黑住家必須保持啟用');
   restored.cities[i].enabled=before.enabled;restored.cities[i].weight=before.weight;
  }
  if(!equal(restored,old))fail('城市名稱、ID、座標與來源在此頁為唯讀');
  if(!next.cities.some(c=>c.enabled&&['delivery','home-delivery'].includes(c.role)&&c.id!=='munich'))fail('至少保留一個慕尼黑以外的配送城市');
 }else{
  const restored=structuredClone(next);
  for(const [path,[min,max]] of Object.entries(travelFields)){
   const keys=path.split('.'),key=keys.pop(),target=keys.reduce((o,k)=>o?.[k],next),original=keys.reduce((o,k)=>o?.[k],old),copy=keys.reduce((o,k)=>o?.[k],restored);
   const value=target?.[key];if(!Number.isInteger(value)||value<min||value>max)fail(`${path} 需為 ${min}–${max} 的整數`);
   copy[key]=original[key];
  }
  if(!equal(restored,old))fail('僅可修改頁面列出的旅遊與重試欄位；速度、住家及其他既定規則為唯讀');
 }
 return JSON.stringify(next,null,2)+'\n';
}
export function previewSetting(p,body){
 const {kind,expectedHash}=body;if(!Object.hasOwn(settingsPaths,kind))fail('未知設定');
 const current=settingText(p,kind);if(hashText(current)!==expectedHash)fail('設定已在其他分頁變更，請重新載入後再編輯',409);
 const text=validateSetting(kind,body.text,current),changes=[];
 if(kind==='character'){if(text.replaceAll('\r\n','\n')!==current.replaceAll('\r\n','\n'))changes.push({field:'角色生活與寫作設定',before:'目前版本',after:'修訂版本'});}
 else{
  const old=JSON.parse(current),next=JSON.parse(text);
  if(kind==='cities'){for(let i=0;i<old.cities.length;i++)for(const key of ['enabled','weight'])if(old.cities[i][key]!==next.cities[i][key])changes.push({field:old.cities[i].name+' · '+key,before:old.cities[i][key],after:next.cities[i][key]});}
  else {for(const field of Object.keys(travelFields)){const get=o=>field.split('.').reduce((v,k)=>v[k],o);if(get(old)!==get(next))changes.push({field:travelFields[field][2],before:get(old),after:get(next)});}
  }
 }
 return {kind,text,expectedHash,hash:hashText(text),changes};
}
/** @param {any} p @param {any} body @param {any} options */
export async function saveSetting(p,body,{backup,write,now=Date.now()}={}){
 const preview=previewSetting(p,body);
 if(!preview.changes.length)return {updated:false,hash:preview.expectedHash};
 if(typeof body.reason!=='string'||body.reason.trim().length<2||body.reason.length>300)fail('請填寫2至300字的修改原因');
 // Durable per-resource versions remain outside the rolling world snapshots.
 const before=settingText(p,body.kind),beforeHash=hashText(before);
 await backup(body.kind,beforeHash,before);await backup(body.kind,preview.hash,preview.text);
 const record={id:crypto.randomUUID(),kind:body.kind,at:now,beforeHash,hash:preview.hash,reason:body.reason.trim(),action:body.action==='restore'?'restore':'save',changes:preview.changes.length};
 p.maintenance??={current:{},history:[]};p.maintenance.current[body.kind]=record;
 p.maintenance.history.push(record);p.maintenance.history=p.maintenance.history.slice(-200);
 write(settingsPaths[body.kind],preview.text);
 return {updated:true,record,hash:preview.hash};
}

// Export an explicit diagnostic projection rather than arbitrary files, auth or runtime secrets.
export function redact(value,secrets=[]){
 const clean=s=>{let text=String(s);for(const secret of secrets)if(typeof secret==='string'&&secret.length>=4)text=text.split(secret).join('[遮罩]');return text.replace(/https?:\/\/[^\s"<>]+/g,url=>{try{const u=new URL(url);u.username='';u.password='';u.search='';u.hash='';return u.href;}catch{return '[網址已遮罩]';}}).replace(/Bearer\s+\S+/gi,'Bearer [遮罩]').replace(/\b(?:AIza[\w-]{20,}|sk-[\w-]{16,})\b/g,'[遮罩]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email遮罩]').replace(/((?:token|secret|password|cookie|authorization|api[_-]?key|nonce)\s*[=:]\s*)[^\s,;]+/gi,'$1[遮罩]');};
 const walk=(v,depth=0)=>{if(depth>18)return '[深度限制]';if(typeof v==='string')return clean(v).slice(0,12000);if(Array.isArray(v))return v.slice(-200).map(x=>walk(x,depth+1));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,/(?:token|secret|password|cookie|authorization|nonce|email|\bsub\b|api.?key)/i.test(k)?'[遮罩]':walk(x,depth+1)]));return v;};return walk(value);
}
export function diagnosticBundle(p,monitor,client,secrets=[]){
 const w=p.world||{},jobs=w.publicationJobs||[];
 return redact({version:2,cloud:true,createdAt:new Date().toISOString(),world:{id:w.publicationWorldId,now:w.now,realAt:w.realAt,location:w.location,pendingJob:w.pendingJob,activity:w.operation,diaries:(w.diaries||[]).map(d=>({day:d.day,title:d.title,publication:d.publication}))},eventPlan:{version:p.eventPlan?.version,until:p.eventPlan?.until,events:p.eventPlan?.events},publication:{jobs,metrics:p.cloudMetrics,failures:p.cloudFailures},monitor,settings:{resources:settingsView(p).resources.map(({kind,hash,revision,applied})=>({kind,hash,revision,applied})),history:settingsView(p).history},client:client&&{viewport:client.viewport,online:client.online,events:client.events}},secrets);
}

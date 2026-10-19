import {env} from 'cloudflare:workers';
// @ts-ignore
import {open,readCookie} from '../../../lib/probe.mjs';
// @ts-ignore
import {principal,allowed,submit,decide,setCapacity,notify,gmailConfigured,removeMember,adminAllowed} from '../../../lib/access.mjs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(v:any,status=200)=>Response.json(v,{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
async function user(req:Request){const s=await open(readCookie(req,'__Host-probe_session'),(env as any).PROBE_SESSION_SECRET);return principal((env as any).DB,s);}
export async function GET(req:Request){try{const action=new URL(req.url).pathname.split('/').pop(),db=(env as any).DB,p=await user(req);if(!p)return json({error:'請先使用Google登入'},401);
 if(action==='status'){const request=await db.prepare('SELECT reason,created FROM access_requests WHERE sub=?').bind(p.sub).first();return json({email:p.email,status:p.status,owner:!!p.owner,readerAccess:allowed(p),request,isolated:false,productionAccess:allowed(p)});}
 if(action==='content'||action==='image'){if(!allowed(p))return json({error:'尚未取得觀看許可'},403);if(action==='content')return json({title:'已核准讀者測試內容',text:'這是隔離站測試資料，不是正式日記。'});return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="100"><rect width="360" height="100" fill="#f3dfaa"/><text x="20" y="56" font-size="18">Approved reader test image</text></svg>',{headers:{...headers,'Content-Type':'image/svg+xml'}});}
 if(action==='admin'){if(!adminAllowed(p))return json({error:p.owner?'管理登入已超過30分鐘，請重新使用Google登入':'僅擁有者可操作',reauth:!!p.owner},403);const members=await db.prepare('SELECT m.*,r.reason,r.created FROM members m LEFT JOIN access_requests r ON r.sub=m.sub WHERE m.sub NOT IN (SELECT sub FROM owner_identity) ORDER BY r.created DESC LIMIT 200').all();const notifications=await db.prepare('SELECT id,state,attempts,error,provider_id,next_attempt FROM notification_outbox ORDER BY next_attempt DESC LIMIT 100').all();const capacity=await db.prepare('SELECT capacity FROM access_settings WHERE id=1').first();return json({members:members.results,notifications:notifications.results,capacity:capacity?.capacity??10,mailConfigured:gmailConfigured(env),retryMode:'送出申請時嘗試；管理者可按鈕重試，沒有無人排程。accepted僅代表Gmail API受理；review需先核對寄件備份，避免重複寄送。'});}
 return json({error:'Not found'},404);
 }catch{return json({error:'暫時無法讀取，請稍後重試'},503);}}
export async function POST(req:Request){try{const u=new URL(req.url);if(req.headers.get('origin')!==u.origin)return json({error:'Invalid origin'},403);const p=await user(req);if(!p)return json({error:'請先使用Google登入'},401);const action=u.pathname.split('/').pop(),db=(env as any).DB;
 if(!['apply','decision','capacity','retry','remove'].includes(action||''))return json({error:'Not found'},404);
 if(action!=='apply'&&!adminAllowed(p))return json({error:p.owner?'管理登入已超過30分鐘，請重新使用Google登入':'僅擁有者可操作',reauth:!!p.owner},403);
 if(Number(req.headers.get('content-length')||0)>8192)return json({error:'Request too large'},413);const text=await req.text();if(text.length>8192)return json({error:'Request too large'},413);const body=text?JSON.parse(text):{};
 if(action==='apply'){const result=await submit(db,p,body.reason,u.origin,(env as any).OWNER_EMAIL);const delivery=await notify(db,env);return json({saved:result.created,notification:delivery.state});}
 if(action==='remove'){const changed=await removeMember(db,p,body.sub);return json(changed?{removed:true}:{error:'帳號不存在或不可移除擁有者'},changed?200:409);}
 if(action==='decision'){const changed=await decide(db,p,body.sub,body.action);return json(changed?{updated:true}:{error:'未變更：請確認目前狀態或核准人數上限'},changed?200:409);}
 if(action==='capacity'){const changed=await setCapacity(db,p,body.capacity);return json(changed?{updated:true}:{error:'上限不能低於目前已核准人數'},changed?200:409);}
 return json(await notify(db,env));
 }catch(e:any){return json({error:['ALREADY_REQUESTED','FORBIDDEN','INVALID_ACTION','INVALID_CAPACITY','理由請填5至1000字'].includes(e.message)?e.message:'操作未完成，請重新整理核對狀態'},400);}}

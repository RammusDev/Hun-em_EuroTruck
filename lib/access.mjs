import {gmailConfigured,gmailAccessToken,rawNotification} from './gmail.mjs';
export {gmailConfigured} from './gmail.mjs';
export const SESSION_SECONDS=7*24*60*60;
export const ADMIN_FRESH_MS=30*60*1000;
export const adminAllowed=p=>!!p?.owner&&p.adminFresh===true;
export async function consumeFlow(db,nonce,now=Date.now()){
 return !!await db.prepare('DELETE FROM auth_flows WHERE nonce=? AND expires>? RETURNING nonce').bind(nonce,now).first();
}
// All callers supply a server-verified Google identity; never accept sub/email from request JSON.
export async function register(db,user,ownerEmail,now=Date.now()){
 const sid=crypto.randomUUID(),expires=now+SESSION_SECONDS*1000;
 await db.batch([
  db.prepare('INSERT INTO members(sub,email,status) VALUES(?,?,?) ON CONFLICT(sub) DO UPDATE SET email=excluded.email').bind(user.sub,user.email,'unrequested'),
  db.prepare('INSERT OR IGNORE INTO owner_identity(id,sub) SELECT 1,? WHERE ?=?').bind(user.sub,user.email.toLowerCase(),String(ownerEmail||'').toLowerCase()),
  db.prepare('INSERT OR IGNORE INTO access_settings(id,capacity) VALUES(1,10)'),
  db.prepare('DELETE FROM sessions WHERE expires<=?').bind(now),
  db.prepare('INSERT INTO sessions(id,sub,expires) VALUES(?,?,?)').bind(sid,user.sub,expires)
 ]);return {...user,sid,authAt:now,exp:expires};
}
export async function principal(db,s,now=Date.now()){
 if(!s?.sid||!s.sub)return null;
 const p=await db.prepare('SELECT m.sub,m.email,m.status,CASE WHEN o.sub IS NOT NULL THEN 1 ELSE 0 END AS owner FROM sessions s JOIN members m ON m.sub=s.sub LEFT JOIN owner_identity o ON o.sub=m.sub WHERE s.id=? AND s.sub=? AND s.expires>?').bind(s.sid,s.sub,now).first();
 return p?{...p,adminFresh:Number.isFinite(s.authAt)&&s.authAt<=now&&now-s.authAt<ADMIN_FRESH_MS}:null;
}
export const allowed=p=>!!p&&(!!p.owner||p.status==='approved');
export async function removeMember(db,actor,sub,now=Date.now()){
 if(!adminAllowed(actor))throw Error('FORBIDDEN');if(typeof sub!=='string'||!sub)throw Error('INVALID_ACTION');
 const target=await db.prepare('SELECT sub FROM members WHERE sub=? AND sub NOT IN (SELECT sub FROM owner_identity)').bind(sub).first();if(!target)return false;
 const guarded='sub=? AND sub NOT IN (SELECT sub FROM owner_identity)';
 const r=await db.batch([
  db.prepare(`DELETE FROM sessions WHERE ${guarded}`).bind(sub),
  db.prepare(`DELETE FROM access_requests WHERE ${guarded}`).bind(sub),
  db.prepare(`UPDATE notification_outbox SET state='cancelled',lease=NULL,lease_until=NULL,error='帳號已移除，取消未完成通知' WHERE ${guarded} AND state IN ('pending','failed','review','sending')`).bind(sub),
  db.prepare(`DELETE FROM members WHERE ${guarded}`).bind(sub),
  db.prepare('INSERT INTO audit_events(id,actor,subject,action,created) SELECT ?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),actor.sub,sub,'remove',now)
 ]);return r[3].meta.changes===1;
}
export async function submit(db,p,reason,origin,recipient,now=Date.now()){
 if(!p||p.owner||p.status!=='unrequested')throw Error('ALREADY_REQUESTED');
 if(typeof reason!=='string'||reason.trim().length<5||reason.length>1000)throw Error('理由請填5至1000字');
 const id=crypto.randomUUID(),payload=JSON.stringify({to:recipient,adminUrl:origin+'/admin'});
 const r=await db.batch([
  db.prepare("INSERT OR IGNORE INTO access_requests(sub,reason,created) SELECT sub,?,? FROM members WHERE sub=? AND status='unrequested'").bind(reason.trim(),now,p.sub),
  db.prepare("INSERT INTO notification_outbox(id,sub,payload,state,next_attempt) SELECT ?,?,?, 'pending',? WHERE changes()=1").bind(id,p.sub,payload,now),
  db.prepare("UPDATE members SET status='pending' WHERE sub=? AND status='unrequested' AND EXISTS(SELECT 1 FROM access_requests WHERE sub=?)").bind(p.sub,p.sub)
 ]);return {created:r[0].meta.changes===1,id};
}
export async function decide(db,actor,sub,action,now=Date.now()){
 if(!adminAllowed(actor))throw Error('FORBIDDEN');if(!['approve','reject','revoke'].includes(action)||typeof sub!=='string')throw Error('INVALID_ACTION');
 const status={approve:'approved',reject:'rejected',revoke:'revoked'}[action];
 const condition=action==='approve'?"status IN ('pending','rejected','revoked') AND (SELECT COUNT(*) FROM members WHERE status='approved' AND sub NOT IN (SELECT sub FROM owner_identity)) < (SELECT capacity FROM access_settings WHERE id=1)":action==='reject'?"status='pending'":"status='approved'";
 const r=await db.batch([
  db.prepare(`UPDATE members SET status=? WHERE sub=? AND sub NOT IN (SELECT sub FROM owner_identity) AND ${condition}`).bind(status,sub),
  db.prepare('INSERT INTO audit_events(id,actor,subject,action,created) SELECT ?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),actor.sub,sub,action,now)
 ]);return r[0].meta.changes===1;
}
export async function setCapacity(db,actor,value,now=Date.now()){
 if(!adminAllowed(actor))throw Error('FORBIDDEN');if(!Number.isInteger(value)||value<1||value>1000)throw Error('INVALID_CAPACITY');
 const r=await db.batch([
 db.prepare("UPDATE access_settings SET capacity=? WHERE id=1 AND ? >= (SELECT COUNT(*) FROM members WHERE status='approved' AND sub NOT IN (SELECT sub FROM owner_identity))").bind(value,value),
 db.prepare('INSERT INTO audit_events(id,actor,subject,action,created) SELECT ?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),actor.sub,'capacity','capacity:'+value,now)
 ]);return r[0].meta.changes===1;
}
export async function notify(db,config,fetcher=fetch,now=Date.now()){
 const started=Date.now();
 if(!gmailConfigured(config))return {state:'not_configured'};
 // A lost response after sending has unknown outcome: Gmail has no Resend-style idempotency key.
 await db.prepare("UPDATE notification_outbox SET state='review',error='寄送結果不明，請先檢查Gmail寄件備份',lease=NULL,lease_until=NULL WHERE state='sending' AND lease_until<?").bind(now).run();
 const lease=crypto.randomUUID();
 const row=await db.prepare("UPDATE notification_outbox SET lease=?,lease_until=?,attempts=attempts+1,first_attempt=COALESCE(first_attempt,?) WHERE id=(SELECT id FROM notification_outbox WHERE state IN ('pending','failed') AND next_attempt<=? AND attempts<5 AND (lease_until IS NULL OR lease_until<?) ORDER BY next_attempt LIMIT 1) RETURNING *").bind(lease,now+60000,now,now,now).first();
 if(!row)return {state:'idle'};
 let sending=false;
 try{
 const payload=JSON.parse(row.payload);if(payload.to!==config.OWNER_EMAIL)throw Error('RECIPIENT_CHANGED');
 // Old queued payloads may contain reasons. Only extract the trusted same-site admin link; never forward the old text.
 const adminUrl=payload.adminUrl||(typeof payload.text==='string'?payload.text.match(/https:\/\/[^\s]+\/admin/)?.[0]:null);
 const raw=rawNotification(config.GMAIL_SENDER_EMAIL,config.OWNER_EMAIL,adminUrl,row.id),accessToken=await gmailAccessToken(config,fetcher);
 const claimed=await db.prepare("UPDATE notification_outbox SET state='sending' WHERE id=? AND lease=? AND lease_until>?").bind(row.id,lease,now+Date.now()-started).run();
 if(!claimed.meta.changes)return {state:'idle'};sending=true;
 const response=await fetcher('https://gmail.googleapis.com/gmail/v1/users/'+encodeURIComponent(config.GMAIL_SENDER_EMAIL)+'/messages/send',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({raw}),signal:AbortSignal.timeout(10000)});
 if(!response.ok){if([400,401,403,404,429].includes(response.status))sending=false;throw Error('GMAIL_SEND_'+response.status);}const data=await response.json();if(typeof data.id!=='string')throw Error('INVALID_PROVIDER_RESPONSE');
 await db.prepare("UPDATE notification_outbox SET state='accepted',provider_id=?,error=NULL,lease=NULL,lease_until=NULL WHERE id=? AND lease=?").bind(data.id,row.id,lease).run();return {state:'accepted'};
 }catch(e){const state=sending?'review':'failed';await db.prepare("UPDATE notification_outbox SET state=?,error=?,next_attempt=?,lease=NULL,lease_until=NULL WHERE id=? AND lease=?").bind(state,sending?'寄送結果不明，請先檢查Gmail寄件備份':String(e.message).slice(0,100),now+Math.min(3600000,60000*2**row.attempts),row.id,lease).run();return {state};}
}

import {gmailConfigured,gmailAccessToken} from './gmail.mjs';
import {monitorReport,safeReason,berlinTime} from './monitor-report.mjs';
export async function monitorSchema(db){
 await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS monitor_settings (id INTEGER PRIMARY KEY, email_enabled INTEGER NOT NULL DEFAULT 0, lease TEXT, lease_until INTEGER, checked_at INTEGER NOT NULL DEFAULT 0)'),
  db.prepare('CREATE TABLE IF NOT EXISTS monitor_incidents (id TEXT PRIMARY KEY, state TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, action TEXT NOT NULL, severity TEXT NOT NULL, opened_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, notified_version INTEGER NOT NULL DEFAULT 0)'),
  db.prepare('CREATE TABLE IF NOT EXISTS monitor_delivery (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, version INTEGER NOT NULL, state TEXT NOT NULL, summary TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, lease TEXT, lease_until INTEGER, provider_id TEXT, error TEXT)'),
  db.prepare('CREATE TABLE IF NOT EXISTS monitor_tool_failures (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, stage TEXT NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL)'),
 ]);
 await db.prepare('INSERT OR IGNORE INTO monitor_settings(id) VALUES(1)').run();
}
export async function recordToolFailure(db,jobId,stage,error,now=Date.now()){
 await monitorSchema(db);
 await db.prepare('INSERT INTO monitor_tool_failures(id,job_id,stage,reason,at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),jobId,String(stage).slice(0,60),safeReason(error?.message||error),now).run();
 await db.prepare('DELETE FROM monitor_tool_failures WHERE at<?').bind(now-14*86400000).run();
}
export async function monitorHistory(db){
 // GET monitoring is read-only, including before the first background check.
 const ready=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='monitor_settings'").first();
 if(!ready)return {emailEnabled:false,lastBackgroundCheck:null,incidents:[],deliveries:[],toolFailures:[]};
 const [settings,incidents,deliveries,failures]=await Promise.all([
  db.prepare('SELECT email_enabled,checked_at FROM monitor_settings WHERE id=1').first(),
  db.prepare('SELECT * FROM monitor_incidents ORDER BY updated_at DESC LIMIT 40').all(),
  db.prepare('SELECT id,state,attempts,error,next_at FROM monitor_delivery ORDER BY next_at DESC LIMIT 30').all(),
  db.prepare('SELECT job_id,stage,reason,at FROM monitor_tool_failures ORDER BY at DESC LIMIT 30').all(),
 ]);
 return {emailEnabled:!!settings?.email_enabled,lastBackgroundCheck:settings?.checked_at||null,incidents:incidents.results,deliveries:deliveries.results,toolFailures:failures.results};
}
export async function timerStatus(config,fetcher=fetch){
 if(!config.EVENT_TIMER_CONTROL_URL||!config.BACKGROUND_TICK_SECRET)return null;
 const url=new URL(config.EVENT_TIMER_CONTROL_URL);
 if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev')||url.pathname!=='/arm'||url.username||url.password||url.search||url.hash)throw Error('INVALID_TIMER_CONTROL');
 url.pathname='/status';const stamp=String(Date.now());
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.BACKGROUND_TICK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(['event-control-v1','GET','/status',stamp].join('\n')))).toString('hex');
 const r=await fetcher(url,{headers:{'x-event-time':stamp,'x-event-signature':sig},signal:AbortSignal.timeout(4000),redirect:'manual'});
 if(!r.ok)throw Error('TIMER_STATUS_UNAVAILABLE');return r.json();
}
export async function readMonitor(p,view,config,{now=Date.now(),fetcher=fetch}={}){
 const history=await monitorHistory(config.DB);let clock=null,clockUnavailable=false;
 try{clock=await timerStatus(config,fetcher);}catch{clockUnavailable=true;}
 // Failures preceding a later successful tool operation are historical, not current.
 const failures=history.toolFailures.filter(f=>{const m=p.cloudMetrics?.[f.job_id];return !m?.operations?.some(o=>o.at>f.at&&o.outcome==='ok'&&['write','attach','publish'].includes(o.op));});
 return {...monitorReport(p,view,{now,clock,clockUnavailable,toolFailures:failures}),...history,mailConfigured:gmailConfigured(config)};
}
export async function setMonitorEmail(db,enabled){
 if(typeof enabled!=='boolean')throw Error('INVALID_SETTING');await monitorSchema(db);
 await db.prepare('UPDATE monitor_settings SET email_enabled=? WHERE id=1').bind(enabled?1:0).run();
 if(!enabled)await db.prepare("UPDATE monitor_delivery SET state='cancelled',lease=NULL,lease_until=NULL WHERE state IN ('pending','failed') AND lease IS NULL").run();
 return {enabled};
}
const encoded=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
export function monitorMail(config,summary,id){
 if(!gmailConfigured(config)||!/^[a-zA-Z0-9-]+$/.test(id))throw Error('MAIL_NOT_CONFIGURED');
 const origin=config.BACKGROUND_TICK_ORIGIN;const u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin)throw Error('INVALID_ORIGIN');
 const body=summary+'\r\n\r\n查看 Hun-em 目前活動、發布進度與處理建議：\r\n'+origin+'/admin\r\n\r\n同一狀態不重複通知；Gmail受理不代表已送達。';
 const mime=`From: ${config.GMAIL_SENDER_EMAIL}\r\nTo: ${config.OWNER_EMAIL}\r\nSubject: =?UTF-8?B?${encoded('Hun-em：旅途運行狀態更新')}?=\r\nMessage-ID: <hunem-monitor-${id}@hunem.invalid>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encoded(body)}`;
 return encoded(mime).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
export async function deliverMonitor(config,{now=Date.now(),fetcher=fetch}={}){
 const db=config.DB;if(!gmailConfigured(config))return {state:'not_configured'};
 if(!(await db.prepare('SELECT email_enabled FROM monitor_settings WHERE id=1').first())?.email_enabled)return {state:'disabled'};
 await db.prepare("UPDATE monitor_delivery SET state='review',error='寄送結果不明，請核對Gmail寄件備份',lease=NULL,lease_until=NULL WHERE state='sending' AND lease_until<?").bind(now).run();
 const lease=crypto.randomUUID(),row=await db.prepare("UPDATE monitor_delivery SET lease=?,lease_until=?,attempts=attempts+1 WHERE id=(SELECT id FROM monitor_delivery WHERE state IN ('pending','failed') AND next_at<=? AND attempts<5 AND (lease_until IS NULL OR lease_until<?) ORDER BY next_at LIMIT 1) RETURNING *").bind(lease,now+60000,now,now).first();
 if(!row)return {state:'idle'};
 let sending=false;
 try{
  const raw=monitorMail(config,row.summary,row.id),token=await gmailAccessToken(config,fetcher);
  const claimed=await db.prepare("UPDATE monitor_delivery SET state='sending' WHERE id=? AND lease=? AND lease_until>? AND (SELECT email_enabled FROM monitor_settings WHERE id=1)=1").bind(row.id,lease,Date.now()).run();
  if(!claimed.meta.changes)return {state:'idle'};sending=true;
  const r=await fetcher('https://gmail.googleapis.com/gmail/v1/users/'+encodeURIComponent(config.GMAIL_SENDER_EMAIL)+'/messages/send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({raw}),signal:AbortSignal.timeout(10000)});
  if(!r.ok){if([400,401,403,404,429].includes(r.status))sending=false;throw Error('GMAIL_SEND_'+r.status);}
  const data=await r.json();if(typeof data.id!=='string')throw Error('INVALID_RESPONSE');
  await db.prepare("UPDATE monitor_delivery SET state='accepted',provider_id=?,error=NULL,lease=NULL,lease_until=NULL WHERE id=? AND lease=?").bind(data.id,row.id,lease).run();return {state:'accepted'};
 }catch{
  const state=sending?'review':'failed';await db.prepare('UPDATE monitor_delivery SET state=?,error=?,next_at=?,lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind(state,sending?'寄送結果不明，請核對Gmail寄件備份':'Gmail授權或寄送失敗；將依退避重試',now+Math.min(3600000,60000*2**row.attempts),row.id,lease).run();return {state};
 }
}
export async function runMonitor(p,view,config,{now=Date.now(),fetcher=fetch,force=false}={}){
 const db=config.DB;await monitorSchema(db);const lease=crypto.randomUUID();
 const locked=await db.prepare('UPDATE monitor_settings SET lease=?,lease_until=? WHERE id=1 AND (lease_until IS NULL OR lease_until<?) AND checked_at<=? RETURNING *').bind(lease,now+90000,now,force?now:now-60000).first();
 if(!locked)return {skipped:true};
 try{
  const report=await readMonitor(p,view,config,{now,fetcher}),present=new Set(report.issues.map(i=>i.key));
  for(const i of report.issues)await db.prepare("INSERT INTO monitor_incidents(id,state,title,detail,action,severity,opened_at,updated_at) VALUES(?,'open',?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state='open',title=excluded.title,detail=excluded.detail,action=excluded.action,severity=excluded.severity,updated_at=excluded.updated_at,version=monitor_incidents.version+CASE WHEN monitor_incidents.state<>'open' OR monitor_incidents.severity<>excluded.severity THEN 1 ELSE 0 END").bind(i.key,i.title,i.detail,i.action,i.severity,now,now).run();
  for(const old of report.incidents.filter(i=>i.state==='open'&&!present.has(i.id))){
   if(!report.clock.available&&['clock-retries','clock-disabled'].includes(old.id))continue;
   const oldDay=old.id.match(/:(\d{4}-\d{2}-\d{2})$/)?.[1],expired=oldDay&&now-berlinTime(oldDay,'23:30')>=36*3600000;
   await db.prepare('UPDATE monitor_incidents SET state=?,updated_at=?,version=version+1 WHERE id=?').bind(expired?'archived':'resolved',now,old.id).run();
  }
  if(locked.email_enabled){
   const changed=await db.prepare("SELECT * FROM monitor_incidents WHERE version>notified_version AND (state='open' OR (state='resolved' AND notified_version>0)) ORDER BY updated_at LIMIT 20").all();
   for(const i of changed.results){
    await db.prepare("UPDATE monitor_delivery SET state='cancelled' WHERE incident_id=? AND version<>? AND state IN ('pending','failed') AND (lease_until IS NULL OR lease_until<?)").bind(i.id,i.version,now).run();
    const sent=i.state==='resolved'?await db.prepare("SELECT id FROM monitor_delivery WHERE incident_id=? AND state IN ('accepted','sending','review') LIMIT 1").bind(i.id).first():true;
    if(!sent){await db.prepare('UPDATE monitor_incidents SET notified_version=version WHERE id=?').bind(i.id).run();continue;}
    const summary=(i.state==='resolved'?'已恢復：':'需要留意：')+i.title+(i.state==='resolved'?'\n這項異常已不再出現在本次檢查結果。':'\n'+i.detail+'\n'+i.action);
    await db.batch([
     db.prepare("INSERT INTO monitor_delivery(id,incident_id,version,state,summary,next_at) VALUES(?,?,?,'pending',?,?)").bind(crypto.randomUUID(),i.id,i.version,summary,now),
     db.prepare('UPDATE monitor_incidents SET notified_version=version WHERE id=?').bind(i.id),
    ]);
   }
  }
  // Bounded operational history; world snapshots, diaries and images are untouched.
  await db.prepare("DELETE FROM monitor_delivery WHERE next_at<? AND state IN ('accepted','cancelled')").bind(now-90*86400000).run();
  await db.prepare('UPDATE monitor_settings SET checked_at=? WHERE id=1 AND lease=?').bind(now,lease).run();
  return {checkedAt:now,issues:report.issues.length,delivery:await deliverMonitor(config,{now,fetcher})};
 }finally{await db.prepare('UPDATE monitor_settings SET lease=NULL,lease_until=NULL WHERE id=1 AND lease=?').bind(lease).run();}
}

'use client';
import {useEffect,useState} from 'react';
const fmt=(at:any)=>at?new Intl.DateTimeFormat('zh-TW',{timeZone:'Europe/Berlin',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(at)):'尚無紀錄';
const deliveryLabels:Record<string,string>={accepted:'Gmail 已受理',pending:'等待寄送',sending:'寄送中',failed:'失敗，等待重試',review:'結果不明，需核對寄件備份',cancelled:'已取消'};
export default function MonitorPanel({initialReport=null}:{initialReport?:any}={}){
 const [report,setReport]=useState<any>(initialReport),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){try{const r=await fetch('/api/monitor',{cache:'no-store'});if(!r.ok)throw Error(r.status===403?'管理登入已過期，請重新登入。':'目前無法讀取監控狀態；最後一次資料可能已過時。');const data=await r.json();setReport(data);setError('');}catch(e:any){setError(e.message);}}
 useEffect(()=>{let active=true;const load=()=>{if(active&&document.visibilityState!=='hidden')void refresh();};load();const timer=setInterval(load,60000);document.addEventListener('visibilitychange',load);return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',load);};},[]);
 async function toggle(){setBusy(true);try{const r=await fetch('/api/monitor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({emailEnabled:!report.emailEnabled})});if(!r.ok)throw Error('通知設定未完成，請重新登入後再試。');await refresh();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <section className="access-paper monitor-panel" aria-label="Hun-em 運行狀態">
  <div className="access-section-title"><div><p className="access-eyebrow">HUN-EM, RIGHT NOW</p><h2>Hun-em 現在在做什麼</h2></div><button className="access-button secondary small" onClick={refresh} disabled={busy}>更新狀態</button></div>
  {error?<p role="alert" className="monitor-error">{error}</p>:null}
  {!report?<p role="status">正在讀取旅途與發布進度…</p>:<>
   <p className={'monitor-health '+report.health}>{({ok:'運行正常',warning:'有狀況需要留意',critical:'有異常需要處理'} as any)[report.health]}<small>資料讀取：{fmt(report.checkedAt)} · 柏林時間</small></p>
   <div className="monitor-grid"><article><h3>{report.activity.title}</h3>{report.activity.location?<p>目前城市：{report.activity.location}</p>:null}{report.activity.detail?<p>{report.activity.detail}</p>:null}<p>{report.activity.waitingForPlan?'目前時間已超過保存計畫，正在等待後續安排。':report.activity.until?'本階段預計至 '+fmt(report.activity.until):'目前沒有確定的活動結束時間。'}</p><p>下一步：{report.activity.nextTitle?`${fmt(report.activity.nextAt)} · ${report.activity.nextTitle}`:'到下一個決策點後安排，尚未確定。'}</p></article>
    <article><h3>背景事件</h3><p>下次事件：{fmt(report.activity.nextEventAt)}</p><p>事件服務最近成功：{fmt(report.clock.lastSuccess)}</p><p>連續失敗：{report.clock.failures??'未取得'} 次{report.clock.nextRetryKnown?' · 有待重試事件':''}</p><p>最近背景監控：{fmt(report.lastBackgroundCheck)}</p></article></div>
   <h3>日記與圖片</h3><p className="access-help">每日 23:05 開始，23:30 截止。下列狀態以本站實際收到的步驟為準。</p>
   {report.publication.length?report.publication.map((j:any)=><article className="monitor-journal" key={j.day}><strong>{j.day} · {j.stage}</strong>{j.manualRecovery?<span className="access-badge">人工復原</span>:null}<p>領取工作：{fmt(j.startedAt)} · 最近成功步驟：{fmt(j.lastSuccessAt)}</p><p>刊登：{j.publishedAt?fmt(j.publishedAt):'尚未發布'}</p>{j.lastError?<p>{j.lastError}</p>:null}</article>):<p>今天尚未建立寫作素材；正常情況於 23:00 封存。</p>}
   <h3>目前需要留意</h3>{report.issues.length?<div className="monitor-issues">{report.issues.map((i:any)=><article key={i.key} className={i.severity}><strong>{i.title}</strong><p>{i.detail}</p><p>{i.action}</p></article>)}</div>:<p>目前未發現達到警報門檻的異常。</p>}
   <div className="monitor-notifications"><h3>異常 Email 通知</h3><p>{report.emailEnabled?'已啟用':'尚未啟用'} · {report.mailConfigured?'現有 Gmail 授權可用':'尚未設定完整寄信授權'}</p><p className="access-help">寄給現有擁有者信箱。首次異常、嚴重程度升高或恢復時通知；相同狀態保持安靜。沿用背景健康檢查，通常每 30 分鐘檢查一次。</p><button className="access-button secondary" disabled={busy||!report.mailConfigured&&!report.emailEnabled} onClick={toggle}>{busy?'正在保存…':report.emailEnabled?'停用異常通知':'啟用異常通知'}</button>
    {report.deliveries.length?<details><summary>最近通知紀錄</summary>{report.deliveries.map((d:any)=><p key={d.id}>{deliveryLabels[d.state]||d.state} · 嘗試 {d.attempts} 次{d.error?' · '+d.error:''}</p>)}</details>:null}
   </div>
   <details><summary>異常歷史與監控範圍</summary>{report.incidents.map((i:any)=><p key={i.id}>{i.title} · {({open:'持續中',resolved:'已恢復',archived:'已離開觀察範圍'} as any)[i.state]} · {fmt(i.updated_at)}</p>)}<p className="access-help">{report.limits}</p></details>
  </>}
 </section>;
}

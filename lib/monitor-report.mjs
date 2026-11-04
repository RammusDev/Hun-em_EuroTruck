const minute=60000;
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function berlinParts(at){const p=Object.fromEntries(dateFormat.formatToParts(at).map(x=>[x.type,x.value]));return {day:`${p.year}-${p.month}-${p.day}`,minutes:Number(p.hour)*60+Number(p.minute)};}
export function berlinTime(day,time){const target=Date.parse(`${day}T${time}:00Z`);let t=target;for(let i=0;i<3;i++){const p=Object.fromEntries(dateFormat.formatToParts(t).map(x=>[x.type,x.value]));t+=target-Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);}return t;}
export function safeReason(error){
 const e=String(error||'');
 if(!e)return '未取得確切錯誤；只能依最後成功階段判斷。';
 if(/quota|rate.?limit|額度|429/i.test(e))return '服務回報額度或頻率限制。';
 if(/timeout|timed out|逾時|超時/i.test(e))return '工具或網路回應逾時。';
 if(/auth|session|lease|permission|401|403|權限|登入|過期/i.test(e))return '認證、權限或工作領取期限有問題。';
 if(/IMAGE_FORMAT|PNG|IMAGE_REVIEW|IMAGE_VARIETY|圖片.*檢查/i.test(e))return '圖片格式或目視檢查未通過。';
 if(/REFERENCE|RECENT_ART|參考圖/i.test(e))return '參考圖讀取未完成。';
 if(/WRITING|VALIDATION|校對|驗證/i.test(e))return '文章驗證未通過。';
 return '已記錄失敗；平台未提供可確認的具體根因。';
}
const clean=x=>typeof x==='string'?x.replace(/[\u0000-\u001f]/g,' ').slice(0,240):null;
export function monitorReport(p,view,{now=Date.now(),clock=null,clockUnavailable=false,toolFailures=[],collections=null}={}){
 const {day,minutes}=berlinParts(now),world=p.world,plan=p.eventPlan,issues=[];
 const issue=(key,title,detail,action,severity='warning')=>issues.push({key,title,detail,action,severity});
 for(const [kind,status] of Object.entries(collections||{}))for(const row of status.completion?.items||[]){
  if(row.state==='complete'||row.state==='drawing'||!row.overdue)continue;
  if(row.state==='awaiting_release'){issue('collection-release:'+kind+':'+row.id,(kind==='soda'?'汽水':kind==='footprint'?'景點':'餐點')+'插圖尚待公開',row.name+'：活動已完成，私存成品尚待公開驗證。','核對原圖／縮圖，沿既有背景事件重試公開；不要重新作畫。');continue;}
  const reason=row.state==='reference_blocked'?'參考照片尚未備妥。':row.lastError==='NOTIFICATION_DELIVERY_STOPPED'?'通知投遞已停止，圖片尚未存回。':row.state==='attention_required'?'圖片仍未存回，已停止自動喚起，需核對最後觀測階段。':row.lastError&&row.lastError!=='IMAGE_COMPLETION_NOT_REPORTED'?'生圖步驟回報失敗。':'尚未收到已驗證圖片；通知送達不代表生圖完成。';
  const inactive=status.activeSubscriptions===0;
  if(inactive){issue('collection-subscription:'+kind,(kind==='soda'?'汽水':kind==='footprint'?'景點':'餐點')+'圖片事件訂閱未啟用','已有缺圖記錄，但目前沒有有效事件訂閱。','需要恢復原有事件訂閱，不能靠重送自動喚起。');continue;}
  issue('collection:'+kind+':'+row.id,(kind==='soda'?'汽水':kind==='footprint'?'景點':'餐點')+'插圖尚未完成',row.name+'：'+reason+(row.taskStartedAt?' 已觀測領取工作。':' 尚未觀測到領取工作。'),row.state==='attention_required'?'需要核對工作與來源後手動重試。':row.state==='reference_blocked'?'補上可靠來源後，再人工指定重送。':'受理後不因缺圖再次喚起 AI；核對任務狀態後再人工重送。');
 }
 const events=(plan?.events||[]).filter(e=>e.dueAt>world.realAt).sort((a,b)=>a.dueAt-b.dueAt),next=events[0];
 const overdue=next?Math.max(0,now-next.dueAt):null,expired=plan?now>plan.until+plan.offset:null;
 if(clock?.disabled)issue('clock-disabled','事件服務已停用','目前不會自動處理事件。','若非預期停用，需要管理者確認。','critical');
 else if(!plan||!events.length)issue('clock-missing','未找到後續事件安排','目前無法確認下一次背景喚起。','需要檢查事件服務。','critical');
 else if(overdue>10*minute)issue('event-overdue','事件持續逾期',`下一事件已逾期 ${Math.floor(overdue/minute)} 分鐘；畫面可能正在等待後續安排。`,clock?.pending?'事件服務正在重試；持續失敗時需介入。':'需要檢查事件服務與最近回覆。','critical');
 if(clockUnavailable)issue('clock-unreachable','暫時無法查詢事件服務','網站仍可讀取；這次未取得計時器狀態，無法確認其重試情況。','先等下一次健康檢查；持續失敗時需介入。');
 if(clock?.failures>=3)issue('clock-retries','事件服務連續重試',`已連續失敗 ${clock.failures} 次。${safeReason(clock.lastFailure?.code)}`,'系統會繼續退避重試；需要留意是否恢復。');
 const pending=view.pendingJob||world.pendingJob;
 if(pending&&(pending.blocked||pending.attemptsToday>=3))issue('route-stalled','道路規劃持續失敗',`今天已嘗試 ${pending.attemptsToday||0} 次。${safeReason(pending.errorCode||pending.error)}`,pending.blocked?'已暫停接單；需要檢查道路服務。':'等待既有道路重試，不會重新抽工作。');
 const publication=(world.publicationJobs||[]).filter(j=>j.day<=day).sort((a,b)=>b.day.localeCompare(a.day)).slice(0,2).map(j=>{
  const m=p.cloudMetrics?.[j.id]||{},d=world.diaries?.find(d=>d.publication?.id===j.id),writing=!!p.cloudWriting?.[j.id],image=!!p.cloudImages?.[j.id],failure=toolFailures.find(f=>f.job_id===j.id),startedAt=m.claimedAt||m.startedAt||null;
  const deadline=berlinTime(j.day,'23:30'),startDue=berlinTime(j.day,'23:15');
  const stage=d?(d.illustrations?.length?'圖文已發布':'已無圖發布'):image?'圖片已驗收，等待發布':writing?'文章已完成，等待圖片':startedAt?'已領取工作，文章尚未完成':'尚未觀測到領取工作';
  const reason=failure?.reason||safeReason(j.error);
  // Yesterday remains visible, but historical failures do not become new alerts forever.
  const recent=now-deadline<36*3600000;
  if(recent){
   if(d&&!d.illustrations?.length)issue('publication-no-image:'+j.day,j.day+' 日記無圖發布',reason,'當日不自動補畫；後續新日記繼續正常處理。');
   if(d&&d.publication?.writing==='template-fallback')issue('publication-fallback:'+j.day,j.day+' 使用備用文章','AI 文章未完成，已採事件備用稿。'+reason,'日記已保底發布；需檢查寫作失敗原因。');
   if(!d&&now>=deadline+5*minute)issue('publication-overdue:'+j.day,j.day+' 日記超過截止仍未發布',stage+'。'+reason,'需要檢查截止事件與發布狀態。','critical');
   else if(!d&&!startedAt&&now>=startDue)issue('publication-unobserved:'+j.day,j.day+' 尚未觀測到 AI 工作啟動','未收到成功領取紀錄；不能據此斷定平台排程未喚起。','需要檢查平台排程執行紀錄。');
   else if(!d&&(j.status==='blocked'||j.status==='retry_wait'||failure))issue('publication-failed:'+j.day,j.day+' 發布流程曾失敗',stage+'。'+reason,now<deadline?'同次執行可依既有規則重試，23:30截止。':'需要核對截止發布結果。');
  }
  return {day:j.day,stage,status:j.status,startedAt,writingReady:writing,imageReady:image,publishedAt:d?.publication?.publishedAt||null,deadline,lastSuccessAt:m.imageReadyAt||m.writingReadyAt||startedAt,lastError:j.error||failure?reason:null,manualRecovery:!!d?.publication?.recoveryId};
 });
 if(minutes>=23*60+10&&!publication.some(j=>j.day===day)&&!world.diaries?.some(d=>d.day===day))issue('archive-missing:'+day,'今日寫作素材尚未封存','23:00封存後仍未找到今日發布工作。','需要檢查封存事件。','critical');
 const nextStep=plan?.steps?.find(s=>s.at+(plan.offset||0)>now&&s.publicPatch?.some(([path,put,value])=>path.length===1&&path[0]==='status'&&put&&value!==view.status));
 const nextTitle=nextStep?.publicPatch?.find(([path,put])=>path.length===1&&path[0]==='status'&&put)?.[2];
 const until=view.activity?.until||view.mealPause?.end||view.operation?.end||view.outing?.end;
 const location=(view.cities||[]).find(c=>c.id===(view.personCity||view.location))?.name||null;
 return {checkedAt:now,day,health:issues.some(x=>x.severity==='critical')?'critical':issues.length?'warning':'ok',activity:{title:clean(view.status)||clean(view.activity?.title)||'目前活動資料不足',detail:clean(view.activity?.detail),location:clean(location),until:Number.isFinite(until)?until+(plan?.offset||0):nextStep?nextStep.at+(plan.offset||0):null,nextTitle:clean(nextTitle),nextAt:nextStep?nextStep.at+(plan.offset||0):null,nextEventAt:next?.dueAt||null,nextEventKind:next?.kind||null,waitingForPlan:!!expired},clock:{available:!!clock,lastSuccess:clock?.lastSuccess||null,failures:clock?.failures??null,nextRetryKnown:!!clock?.pending,disabled:!!clock?.disabled,lastFailureAt:clock?.lastFailure?.at||null,lastFailureCode:/^(?:SITE_HTTP_\d{3}|INVALID_SCHEDULE|INVALID_EVENT|OLDER_SCHEDULE|RECEIPT_TOO_LARGE)$/.test(clock?.lastFailure?.code||'')?clock.lastFailure.code:/timeout|abort/i.test(clock?.lastFailure?.code||'')?'TIMEOUT':clock?.lastFailure?'NETWORK_OR_RESPONSE_ERROR':null},publication,collections,issues,limits:'本站只確認已收到的工具步驟；模型內部生圖進度與平台未回報的錯誤不可見。監控與事件服務共用基礎設施，整體停機時無法自行通知。'};
}

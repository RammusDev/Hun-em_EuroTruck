let state, map, marker, line, googleMode=false, currentDiary=null, language='zh', busy=false, fittedJob='';
let motion, motionFresh=false, animationId=null, lastMapFrame=0, refreshSequence=0, appliedSequence=0;
let markerArt='';
function markerSource(){return window.HunemAppearance.markerSource(state);}
function leafletAvatar(){return L.divIcon({className:'cat-marker',html:'<img src="'+markerSource()+'" width="48" height="55" alt="Hun-em">',iconSize:[48,55],iconAnchor:[24,51.7],tooltipAnchor:[0,-48]});}
function googleAvatar(){return {url:markerSource(),scaledSize:new google.maps.Size(48,55),anchor:new google.maps.Point(24,51.7)};}
function updateMarkerArt(){if(!marker)return;const next=markerSource();if(next===markerArt)return;if(googleMode)marker.setIcon(googleAvatar());else marker.setIcon(leafletAvatar());markerArt=next;}
function stopMapAnimation(){if(animationId!==null)cancelAnimationFrame(animationId);animationId=null;}
function paintMarker(p){if(!marker||!p)return;if(googleMode)marker.setPosition({lat:p[1],lng:p[0]});else marker.setLatLng([p[1],p[0]]);}
function startMapAnimation(){
 if(animationId!==null||!map||!motionFresh||!motion?.active||busy||document.hidden)return;
 const frame=now=>{
  animationId=null;
  if(!motionFresh||!motion?.active||busy||document.hidden||now>motion.expiresAt)return;
  if(now-lastMapFrame>=32){paintMarker(motion.position(now));lastMapFrame=now;}
  animationId=requestAnimationFrame(frame);
 };
 animationId=requestAnimationFrame(frame);
}
const $=id=>document.getElementById(id), text=(id,v)=>$(id).textContent=v;
let showZhuyin=false;try{showZhuyin=localStorage.getItem('hunem-zhuyin')==='on';}catch{}
const city=id=>state.cities.find(c=>c.id===id);
function renderReading(container,value,tokens){
 container.replaceChildren();const enabled=showZhuyin&&language==='zh'&&tokens;container.classList.toggle('with-zhuyin',!!enabled);
 if(!enabled){container.removeAttribute('aria-label');container.textContent=value;return;}
 container.setAttribute('aria-label',value);
 for(const token of tokens){if(!token.body){
 const previous=container.lastChild;
 if(/^[，。！？；：、）》」』】]$/u.test(token.text)&&previous?.nodeType===1){
 if(previous.classList.contains('zy-cluster'))previous.append(document.createTextNode(token.text));else{const group=document.createElement('span');group.className='zy-cluster';container.replaceChild(group,previous);group.append(previous,document.createTextNode(token.text));}
 }else container.append(document.createTextNode(token.text));continue;}
 const unit=document.createElement('span'),base=document.createElement('span'),sound=document.createElement('span'),tone=document.createElement('span');
 unit.className='zy-unit';base.className='zy-base';base.textContent=token.text;sound.className='zy-sound';sound.textContent=token.body;sound.setAttribute('aria-hidden','true');tone.className='zy-tone'+(token.neutral?' neutral':'');tone.textContent=token.tone;tone.setAttribute('aria-hidden','true');unit.append(base,sound,tone);container.append(unit);}
}
function renderIllustrations(d){
 const container=$('journal-art'),images=d.illustrations||[];container.replaceChildren();container.hidden=!images.length;$('journal-spread').classList.toggle('has-art',!!images.length);
 for(const art of images){const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=art.src;img.alt=art.alt;img.loading='lazy';img.width=1254;img.height=1254;renderReading(caption,art.caption,d.zhuyin?.captions[images.indexOf(art)]);figure.append(img,caption);container.append(figure);}
 if(images.length){const note=document.createElement('p');note.className='fine';note.textContent='Hun-em 的旅行速寫 · AI 手繪風格場景示意';container.append(note);}
}
function describeEvent(e){
 if(e.type==='journey_stop')return `沿途下班：${e.name}，貨物保留，下一工作日續跑。`;
 if(e.type==='route_failed')return `道路規劃${e.blocked?'待處理':'等待重試'}：${e.error}`;
 if(e.type==='ferry_boarding')return '卡車一起登上渡輪：'+e.name;
 if(e.type==='ferry_arrived')return '渡輪抵岸，先安排完整休息。';
 if(e.type==='leisure_decision')return e.kind==='hotel-rest'?'今天留在旅館休息。':'今天安排當地景點或街區活動。';
 if(['expense','income','reserve'].includes(e.type))return `${e.label} · ${e.amountCents<0?'−':'+'}€${(Math.abs(e.amountCents)/100).toFixed(2)}`;
 if(e.type==='truck_operation_finished')return {maintenance:'卡車保養完成，準備繼續工作。',refuel:'加油完成，油量足夠才接下一單。',work_break:'車務前的 45 分鐘休息完成。'}[e.operation];
 if(e.type==='holiday_decision')return `休假決定：${e.reason}。`;
 if(e.type==='home_trip_planned')return e.airport==='LOCAL'?'送貨完成，在慕尼黑直接回家。':`卡車留在${city(e.location).name}，安排經 ${e.airport} 飛往慕尼黑（靜態模擬航段）。`;
 if(e.type==='personal_travel')return `完成：${e.name}（模擬交通，${e.minutes} 分鐘）。`;
 if(e.type==='home_arrived')return '抵達慕尼黑的家，開始至少 45 小時完整休息。';
 if(e.type==='home_day')return '在慕尼黑家中休假，卡車仍停在工作城市。';
 if(e.type==='truck_reunited')return `回到${city(e.location).name}取車，再連續休息至少 11 小時才復工。`;
 if(e.type==='home_trip_finished')return `返程休息完成，等待下一個工作時段。`;
 if(e.type==='accepted')return `接下工作：${city(e.from).name} → ${city(e.to).name}，${e.cargo.zh}。`;
 if(e.type==='delivered')return `抵達${city(e.to).name}，完成 ${Math.round(e.km)} km，收入 €${e.reward}。`;
 if(e.type==='break_scheduled')return '停車休息 45 分鐘，重新累計連續駕駛與工作時間。';
 if(e.type==='off_duty')return `${e.restDay||e.weekly?'交貨後休假':'結束工作'} · ${city(e.location).name} · ${e.accommodation}`;
 if(e.type==='walk_started')return `${e.transportMode==='passenger'?'搭車前往景點':'附近散步'}：${e.name}，往返與停留共 ${Math.round(e.minutes??90)} 分鐘。`;
 if(e.type==='visit')return `${e.transportMode==='passenger'?'景點行程':'散步'}完成：${e.place.name}，已返回住宿處。`;
 return '旅程狀態更新。';
}
function renderHoliday(){
 renderFinance();
 renderJourneyPlan();
 renderPublicationStatus();
 text('holiday-note',`卡車停留：${state.stay?.name||city(state.location).name}${state.holiday?' · '+(state.holiday.local?'在慕尼黑休假':state.holiday.requiresFlight===false?'搭車返家休假':'搭機返家休假'):''}`);
 if(state.travel){text('route-title',state.travel.name);text('cargo','卡車留在'+city(state.location).name+'，Hun-em 正在搭乘交通工具。');text('provider',state.travel.route.provider);text('distance','—');text('reward','—');text('eta','預計 '+time(state.travel.end)+' 完成此段');}
 else if(state.outing){const o=state.outing;text('route-title',o.place.name);text('cargo',o.transportMode==='passenger'?'搭車往返，抵達後步行閒逛；卡車留在住宿處。':'住宿處附近步行；卡車留在原地。');text('provider',o.transportMode==='passenger'?'景點交通示意 · 非實際道路或班表':'附近模擬步道');text('distance','—');text('reward','—');text('eta','預計 '+time(o.end)+' 返回住宿處');}
 else if(state.atHome){text('route-title','慕尼黑的家');text('cargo','回家休假中；卡車留在'+city(state.location).name+'。');}
}
function renderPublicationStatus(){
 let box=$('publication-status');if(!box){box=document.createElement('p');box.id='publication-status';box.className='publication-status';box.setAttribute('role','status');document.querySelector('.diary-section .section-top').after(box);}
 const publication=state.publication;box.hidden=publication?.mode!=='codex-imagegen';if(box.hidden)return;
 const job=publication.jobs[0],schedule='柏林時間 23:05 起準備發布，最晚 23:30 更新。';
 box.textContent=job?`${job.day} 日記${job.status==='generating'?'正在準備插圖。':job.status==='blocked'||job.status==='retry_wait'?'插圖暫未完成，截止時將先發布文字。':'草稿已保存，等待發布。'} ${schedule}`:schedule;
}
function renderJourneyPlan(){
 let panel=$('journey-plan');if(!panel){panel=document.createElement('details');panel.id='journey-plan';panel.className='journey-plan';document.querySelector('.job-card').append(panel);}
 const j=state.job?.journey;panel.hidden=!j;if(!j)return;const opened=panel.open;panel.replaceChildren();panel.open=opened;
 const summary=document.createElement('summary');summary.textContent=`固定旅程計畫 · 預估 ${(j.plannedDays||[]).length||'多'} 個行程日`;panel.append(summary);
 const note=document.createElement('p');note.textContent=`陸路 ${Math.round(j.roadKm)} km${j.seaKm>0?' · 渡輪 '+Math.round(j.seaKm)+' km':''}。道路與停靠點已保存；實際停靠時間隨用餐、車務與休息調整。`;panel.append(note);
 const list=document.createElement('ol');for(const day of (j.plannedDays||[]).slice(0,6)){const item=document.createElement('li');item.textContent=`${day.day} · ${day.overnight?.name||'裝卸與行程銜接'}（預估）`;list.append(item);}panel.append(list);
 const next=j.legs[j.index]?.stop;if(next){const p=document.createElement('p');p.textContent='下一備選停靠：'+next.name;panel.append(p);}
}
let zhuyinPendingKey=null,zhuyinFailedKey=null;
function prepareReading(d){
 if(!showZhuyin||language!=='zh'||d.zhuyin||!window.HunemReading)return;
 const key=JSON.stringify([d.title,d.zh,(d.illustrations||[]).map(a=>a.caption)]);
 if(zhuyinPendingKey===key||zhuyinFailedKey===key)return;
 let status=$('zhuyin-load-status');if(!status){status=document.createElement('span');status.id='zhuyin-load-status';status.setAttribute('role','status');status.className='fine';$('reading-tools').append(status);}
 zhuyinPendingKey=key;status.textContent='正在準備注音，文章可先閱讀…';
 window.HunemReading.prepare(d).then(()=>{status.textContent='';renderDiary();}).catch(e=>{zhuyinFailedKey=key;status.textContent=e.message;}).finally(()=>{if(zhuyinPendingKey===key)zhuyinPendingKey=null;});
}
function ledgerIcon(t){
 const c=t.category||'',label=t.label||'';
 if(t.kind==='opening'||c==='opening'||/存款|準備金/.test(label))return 'savings';
 if(t.amountCents>0||t.kind==='income')return 'income';
 if(/hotel|accommodation|lodging/.test(c)||/旅館|住宿|入住/.test(label))return 'hotel';
 if(c==='parking'||/停車/.test(label))return 'parking';
 if(c==='meal'||/吃飯|餐飲|早餐|午餐|晚餐/.test(label))return 'meal';
 if(c==='soda'||/汽水/.test(label))return 'soda';
 if(c==='fuel'||/柴油|加油/.test(label))return 'fuel';
 if(c==='maintenance'||/保養|維修/.test(label))return 'maintenance';
 if(/transport|flight|train|ferry/.test(c)||/交通|機票|車票|渡輪/.test(label))return 'transport';
 return 'receipt';
}
function renderFinance(){
 const f=state.finance,summary=$('finance-summary'),ledger=$('ledger');summary.replaceChildren();ledger.replaceChildren();if(!f){summary.textContent='帳本準備中…';return;}
 const euro=n=>'€'+(n/100).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2});
 const held=state.heldSoda??state.sodaLife?.bottle;
 for(const [label,value,detail] of [['可用現金',euro(f.cashCents)],['柴油餘量',f.fuelLiters.toFixed(1)+' L'],['汽水 · 目前持有',held?.name||'目前沒有汽水',held?.flavour]]){const box=document.createElement('div'),small=document.createElement('span'),strong=document.createElement('strong');small.textContent=label;strong.textContent=value;if(label.startsWith('汽水'))box.className='soda-summary';box.append(small,strong);if(detail){const note=document.createElement('p');note.className='soda-flavour';note.textContent=detail;box.append(note);}summary.append(box);}
 for(const t of [...f.entries].sort((a,b)=>b.time-a.time).slice(0,9)){const row=document.createElement('div'),desc=document.createElement('span'),amount=document.createElement('strong');const date=document.createElement('small');date.textContent=time(t.time);desc.textContent=`${t.label}${t.kind==='transfer'?'（轉入準備金）':''}`;row.append(date);const icon=document.createElement('img');icon.className='ledger-icon';icon.src='/site-art/ledger-'+ledgerIcon(t)+'.svg';icon.alt='';icon.width=32;icon.height=32;icon.setAttribute('aria-hidden','true');row.append(icon);amount.textContent=(t.amountCents<0?'−':'+')+euro(Math.abs(t.amountCents));row.className='ledger-row';amount.className=t.amountCents>0?'income':'';row.append(desc,amount);ledger.append(row);}
}
const time=t=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Europe/Berlin',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(t);
async function initMap(){if(state.googleKey){await new Promise((resolve,reject)=>{window.initHunEmMap=resolve;const script=document.createElement('script');script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(state.googleKey)}&callback=initHunEmMap&loading=async`;script.onerror=reject;document.head.append(script);});map=new google.maps.Map($('map'),{center:{lat:state.position[1],lng:state.position[0]},zoom:9,mapId:'DEMO_MAP_ID',renderingType:'VECTOR',mapTypeControl:false,streetViewControl:false});googleMode=true;marker=new google.maps.Marker({map,icon:googleAvatar(),title:'Hun-em'});line=new google.maps.Polyline({map,strokeColor:'#526f47',strokeWeight:5});}else{if(!window.L)throw Error('地圖程式未載入。請確認網路連線後重新整理。');map=L.map('map',{scrollWheelZoom:false}).setView([state.position[1],state.position[0]],9);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:18}).addTo(map);state.cities.forEach(c=>L.circleMarker([c.p[1],c.p[0]],{radius:5,color:'#768368',fillOpacity:1}).addTo(map).bindTooltip(`${c.name} · ${c.latin}`,{permanent:true,direction:'top',className:'city-label'}));marker=L.marker([state.position[1],state.position[0]],{icon:leafletAvatar()}).addTo(map).bindTooltip('Hun-em');line=L.polyline([],{color:'#526f47',weight:5}).addTo(map);}}
function drawMap(){if(!map)return;updateMarkerArt();if(state.outing&&!state.travel){const o=state.outing,p=motion?.position(performance.now())||state.position,origin=o.origin||city(o.location).p,destination=o.place.p,walkPlan=HunemWalk.plan(o,origin),walkPoints=walkPlan.points,ride=o.transportMode==='passenger'&&['outbound','return'].includes(walkPlan.sample(state.now).kind),fitKey=o.transportMode==='passenger'?`${o.start}:${ride?'ride':'walk'}`:o.start;if(googleMode){marker.setPosition({lat:p[1],lng:p[0]});line.setPath(walkPoints.map(c=>({lat:c[1],lng:c[0]})));if(fittedJob!==fitKey){if(ride){const bounds=new google.maps.LatLngBounds();walkPoints.forEach(c=>bounds.extend({lat:c[1],lng:c[0]}));map.fitBounds(bounds,45);}else{map.setCenter({lat:destination[1],lng:destination[0]});map.setZoom(15);}fittedJob=fitKey;}}else{marker.setLatLng([p[1],p[0]]);line.setLatLngs(walkPoints.map(c=>[c[1],c[0]]));if(fittedJob!==fitKey){if(ride)map.fitBounds(line.getBounds(),{padding:[45,45]});else map.setView([destination[1],destination[0]],15);fittedJob=fitKey;}}return;}const j=state.job||state.travel,p=motion?.position(performance.now())||state.position,coords=j?.route.coords||[];if(!j&&state.atHome&&fittedJob!=='home'){if(googleMode){map.setCenter({lat:p[1],lng:p[0]});map.setZoom(11);}else map.setView([p[1],p[0]],11);fittedJob='home';}if(googleMode){line.setOptions({geodesic:state.travel?.mode==='flight'});marker.setPosition({lat:p[1],lng:p[0]});line.setPath(coords.map(c=>({lat:c[1],lng:c[0]})));if(j&&fittedJob!==j.start){if(state.travel){const bounds=new google.maps.LatLngBounds();coords.forEach(c=>bounds.extend({lat:c[1],lng:c[0]}));map.fitBounds(bounds,45);}else{map.setCenter({lat:p[1],lng:p[0]});map.setZoom(9);}fittedJob=j.start;}}else{marker.setLatLng([p[1],p[0]]);line.setLatLngs(coords.map(c=>[c[1],c[0]]));line.setStyle({dashArray:j&&!j.route.verified?'8 10':null});if(j&&fittedJob!==j.start){if(state.travel)map.fitBounds(line.getBounds(),{padding:[45,45]});else map.setView([p[1],p[0]],9);fittedJob=j.start;}}}
function render(){window.HunemAlbum?.update(state.album||[]);text('clock',`${time(state.now)} · 柏林時間${state.speed===0?' · 暫停':state.speed>1?' · '+state.speed+'×':''}`);text('status',state.status);$('status').dataset.activity=state.travel?'travel':state.outing?'walk':state.duty?.closed||state.atHome?'rest':state.job?'work':'rest';text('duty',state.duty?'今日實際工作：'+(state.duty.workMinutes/60).toFixed(1)+' 小時；駕駛 '+(state.duty.driveMinutes/60).toFixed(1)+' 小時。':'今日尚無工時紀錄。');const j=state.job;text('route-title',j?`${city(j.from).name} → ${city(j.to).name}`:`${city(state.location).name}附近`);text('cargo',j?`▣ ${j.cargo.zh} · 工作單 #${String(state.events.filter(e=>e.type==='accepted').length).padStart(3,'0')}`:'工作告一段落，等待下一次出發。');$('progress').style.width=`${state.progress*100}%`;text('percent',`${Math.floor(state.progress*100)}%`);text('eta',j?(j.journey?'跨日旅程 · 沿途停靠後繼續':`預計 ${time(j.start+j.duration)} 完成`):'每日 08:00–16:00 · 交貨後休假');text('distance',j?`${j.route.verified?'':'約 '}${Math.round(j.route.km)} km`:'—');text('reward',j?`€ ${j.reward}`:'—');text('total',`${Math.round(state.totalKm)} km`);text('provider',j?j.route.provider:(state.googleKey?'Google Maps · 等待下一單':'OpenStreetMap · 等待下一單'));$('google-link').href=j?`https://www.google.com/maps/dir/?api=1&origin=${city(j.from).p[1]},${city(j.from).p[0]}&destination=${city(j.to).p[1]},${city(j.to).p[0]}&travelmode=driving`:`https://www.google.com/maps/search/?api=1&query=${state.position[1]},${state.position[0]}`;$('speed').value=state.speed;
renderRouteControls();const archive=$('archive');archive.replaceChildren();[...state.diaries].reverse().forEach(d=>{const b=document.createElement('button');b.textContent=`${d.day} · ${d.title}`;b.classList.toggle('active',currentDiary===d.day);b.onclick=()=>{currentDiary=d.day;render();};archive.append(b);});if(!state.diaries.length){archive.textContent='旅程剛剛開始…';}if(!currentDiary&&state.diaries.length)currentDiary=state.diaries.at(-1).day;renderDiary();
const events=$('events');events.replaceChildren();[...state.events].filter(e=>e.time<=state.now&&e.type!=='expense'&&!(e.type==='off_duty'&&state.events.some(other=>other.type==='journey_stop'&&other.day===e.day&&other.time===e.time))).reverse().slice(0,6).forEach(e=>{const div=document.createElement('div');div.className='event';div.dataset.event=e.type;const small=document.createElement('small');small.textContent=time(e.time);const body=document.createElement('span');body.textContent=describeEvent(e);/*e.type==='accepted'?`接下工作：${city(e.from).name} → ${city(e.to).name}，運送${e.cargo.zh}。`:`送達${city(e.to).name}，完成 ${Math.round(e.km)} km，收入 €${e.reward}。`;*/div.append(small,body);events.append(div);});if(!state.events.length)events.textContent='Hun-em 正在準備他的第一份工作。';renderHoliday();drawMap();}
function renderSources(d){let box=$('additional-sources');if(!box){box=document.createElement('div');box.id='additional-sources';box.className='fine';box.style.cssText='display:flex;flex-wrap:wrap;gap:6px 12px';$('source').parentElement.after(box);}box.replaceChildren();[...new Set(d.sources||[])].filter(u=>u&&u!==d.source).slice(0,6).forEach((url,i)=>{try{const u=new URL(url);if(u.protocol!=='https:')return;const a=document.createElement('a');a.href=u.href;a.textContent='延伸資料 '+(i+1)+' · '+u.hostname.replace(/^www\./,'');a.target='_blank';a.rel='noopener noreferrer';box.append(a);}catch{}});}
function renderDiary(){const original=state.diaries.find(x=>x.day===currentDiary);const d=original?(window.HunemReading?.get(original)||original):null;document.querySelector('.diary-grid').classList.toggle('is-empty',!d);$('diary-empty').hidden=!!d;$('diary-content').hidden=!d;if(!d)return;prepareReading(d);text('diary-date',`${d.day} · ${d.tripCount} 份工作`);text('diary-title',d.title);renderIllustrations(d);renderReading($('article-text'),language==='zh'?d.zh:d.learning[language].text,d.zhuyin?.text);renderReading($('diary-title'),d.title,d.zhuyin?.title);$('reading-tools').hidden=language!=='zh';$('zhuyin-toggle').checked=showZhuyin;$('source').href=d.source;renderSources(d);text('notice',d.notice);document.querySelectorAll('[data-lang]').forEach(b=>b.classList.toggle('selected',b.dataset.lang===language));const learning=$('learning');learning.replaceChildren();if(language!=='zh'){const box=document.createElement('div');box.className='learning-box';const h=document.createElement('h4');h.textContent='今天一起學 · '+d.learning[language].label;box.append(h);const lessonNote=document.createElement('p');lessonNote.textContent=d.learning[language].exhausted?'今天只學詞彙，沒有安排文法教學。':(d.learning[language].grammarTitles?.[0]||'')+' · '+(d.learning[language].stage?.includes('review')?'今日複習':'今日新文法');box.append(lessonNote);d.learning[language].grammar.forEach(([example,explanation])=>{const p=document.createElement('p'),strong=document.createElement('strong');strong.textContent=example;p.append(strong,document.createElement('br'),document.createTextNode(explanation));box.append(p);});const words=document.createElement('p');words.textContent=d.learning[language].words.join('　／　');box.append(words);learning.append(box);}}
let refreshInFlight=null;
function refresh(initial=false){
 if(refreshInFlight)return refreshInFlight;
 refreshInFlight=(async()=>{const sequence=++refreshSequence,started=performance.now();try{const r=await fetch(initial?'/api/state?view=committed':'/api/state');if(!r.ok)throw Error('無法取得旅程狀態');const next=await r.json();if(sequence<appliedSequence)return;appliedSequence=sequence;state=next;const received=performance.now();motionFresh=!state.syncPending;motion=motionFresh?HunemMotion.create(state,received-Math.min(1000,(received-started)/2)):null;if(!motionFresh)stopMapAnimation();render();if(state.syncPending)text('status',state.status+' · 正在同步最新旅程');startMapAnimation();}catch(e){if(sequence>=appliedSequence){motionFresh=false;stopMapAnimation();}throw e;}})().finally(()=>{refreshInFlight=null;});
 return refreshInFlight;
}
async function control(command){if(busy)return;busy=true;motionFresh=false;stopMapAnimation();document.querySelectorAll('.control-row button,.control-row select').forEach(b=>b.disabled=true);text('message',command.action==='retry-route'?'正在查詢原工作路線，請稍候…':'正在推進共同行程與安排道路，請稍候…');try{const r=await fetch(command.action==='retry-route'?'/api/retry-route':'/api/control',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.adminToken},body:JSON.stringify(command)});if(!r.ok)throw Error((await r.json()).error);const result=await r.json();if(command.action==='advance'&&result.diaries.length)currentDiary=result.diaries.at(-1).day;await refresh();text('message',command.action==='retry-route'?(state.pendingJob?.error?'查詢未成功，已保存原因與重試狀態。':state.pendingJob?.validatedRoute?'路線已保存，將依正常作息出發。':'路線查詢成功，已接續原工作。'):'已更新，共用旅程已保存。');}catch(e){window.HunemDebug?.record('app-error',{message:e.message,stack:e.stack});text('message',e.message);}finally{busy=false;document.querySelectorAll('.control-row button,.control-row select').forEach(b=>b.disabled=false);renderRouteControls();startMapAnimation();}}
function renderRouteControls(){
 const owner=state.viewerRole==='owner';document.querySelectorAll('.debug-tools,.dev-controls').forEach(el=>el.hidden=!owner);if(!owner)return;
 let panel=$('route-retry-panel');if(!panel){panel=document.createElement('section');panel.id='route-retry-panel';panel.className='route-retry-panel';const title=document.createElement('h3');title.textContent='工作路線查詢';panel.append(title);const list=document.createElement('dl');for(const [id,label] of [['destination','預計目的地'],['error','失敗原因'],['attempts','已嘗試次數'],['next','下次重試時間']]){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.id='route-retry-'+id;row.append(dt,dd);list.append(row);}panel.append(list);const controls=document.createElement('div');controls.className='control-row';const button=document.createElement('button');button.id='retry-route';button.type='button';button.textContent='重試原工作路線';button.onclick=()=>control({action:'retry-route'});controls.append(button);panel.append(controls);const note=document.createElement('p');note.textContent='保留原工作；自動重試只在工作時間進行，每天最多查詢 6 次。手動查詢成功後仍按正常作息出發。';panel.append(note);document.querySelector('.dev-controls').append(panel);}
 const p=state.pendingJob,day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(state.now),count=p?.retryDay===day?(p.attemptsToday||0):0;
 text('route-retry-destination',p?city(p.to).name:state.job?city(state.job.to).name:'目前沒有待查詢的工作');text('route-retry-error',p?.error||'—');text('route-retry-attempts',p?`今日 ${count} / 6 次 · 累計 ${p.attempts||0} 次`:'—');text('route-retry-next',!p?'已取得路線或沒有待辦':p.validatedRoute?'路線已保存，等待正常上工':p.blocked?'等待修正後手動重試':p.retryAt?time(p.retryAt)+' · 柏林時間':'下次符合工作條件時');$('retry-route').disabled=busy||!p||!!state.job||count>=6||!!p.validatedRoute;
}
$('zhuyin-toggle').onchange=e=>{showZhuyin=e.target.checked;zhuyinFailedKey=null;const status=$('zhuyin-load-status');if(status)status.textContent='';try{localStorage.setItem('hunem-zhuyin',showZhuyin?'on':'off');}catch{}renderDiary();};
document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{language=b.dataset.lang;renderDiary();});document.querySelectorAll('[data-hours]').forEach(b=>b.onclick=()=>control({action:'advance',hours:+b.dataset.hours}));$('speed').onchange=e=>control({action:'speed',speed:+e.target.value});$('night').onclick=()=>{let next=state.now;const hour=t=>+new Intl.DateTimeFormat('en',{timeZone:'Europe/Berlin',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(t).filter(x=>x.type==='hour')[0].value;do{next+=60000;}while(hour(next)!==23||hour(next-60000)===23);control({action:'advance',hours:(next-state.now)/3600000});};
(async()=>{try{await refresh(true);const sync=()=>refresh().catch(e=>{window.HunemDebug?.record('refresh-error',{message:e.message,stack:e.stack});text('message',e.message);});void sync();setInterval(()=>{if(!busy)void sync();},10000);try{await initMap();renderHoliday();drawMap();startMapAnimation();}catch(e){$('map-error').hidden=false;text('map-error',e.message||'地圖無法載入，行程與日記仍可使用。');}}catch(e){text('message',e.message);}})();
document.addEventListener('visibilitychange',()=>{stopMapAnimation();motionFresh=false;if(!document.hidden&&!busy)refresh().catch(e=>text('message',e.message));});














(()=>{
 const $=id=>document.getElementById(id),dialog=$('collections-dialog');if(!dialog)return;
 const list=$('collections-list'),status=$('collections-status'),prev=$('collections-prev'),next=$('collections-next');
 const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const fmt=new Intl.DateTimeFormat('zh-TW',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const mobile=matchMedia('(max-width:700px)'),perPage=()=>kind==='soda'?4:mobile.matches?1:2;
 const cache=new Map();let total=0;
 let kind='meal',page=0,opener,request=0,controller,lastSummary=0,summaryPending=false,heldKey;
 let citiesInput,cityNames=new Map();
 function updateCities(cities){if(cities===citiesInput)return;citiesInput=cities;cityNames=new Map((Array.isArray(cities)?cities:[]).filter(city=>city.id&&city.name).map(city=>[city.id,city.name]));}
 function locationName(value){const raw=typeof value==='string'?value:value?.name||value?.id;if(!raw)return '';return cityNames.get(raw)||(/^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/.test(raw)?'':raw);}
 async function get(params,signal){const r=await fetch('/api/collections?'+new URLSearchParams(params),{cache:'no-store',signal});if(!r.ok)throw Error('紀錄暫時無法載入，請稍後重試。');return r.json();}
 function card(row){
  const e=node('article');e.className='collection-card album-page';e.append(node('h3',row.name));
  const caption=[row.brand,row.flavour,kind==='meal'?(row.localDish?'地方特色料理':'日常餐點'):null,row.region].filter(Boolean);if(caption.length)e.append(node('p',caption.join(' · ')));
  if(row.image){const a=node('a');a.href=row.image.src;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','開啟'+row.name+'速寫原圖');const img=node('img');img.src=row.image.src;img.alt=row.name+'速寫';img.loading='lazy';img.decoding='async';img.width=row.image.width||1254;img.height=row.image.height||1254;a.append(img);e.append(a,node('small','點圖查看原圖'));}
  else if(kind==='soda'||row.localDish){const pending=node('div','已留下紀錄，專屬速寫待繪製');pending.className='collection-pending';e.append(pending);}
  else{const note=node('p','保留餐次文字紀錄');note.className='collection-text-note';e.append(note);}
  e.append(node('p',`${kind==='meal'?'吃過':'購買'} ${row.count} 次 · 柏林時間`));
  const history=node('details');history.append(node('summary','每次紀錄'));const meals={breakfast:'早餐',lunch:'午餐',dinner:'晚餐'};
  for(const occurrence of row.occurrences||[]){const line=node('p'),d=new Date(occurrence.time),time=node('time',Number.isNaN(+d)?'時間未保存':fmt.format(d));if(!Number.isNaN(+d))time.dateTime=d.toISOString();const location=locationName(occurrence.location);line.append(time,document.createTextNode(' · '+(kind==='soda'?'購買':(meals[occurrence.meal]||'用餐完成'))+(location?' · '+location:'')));history.append(line);}
  e.append(history);
  const raw=typeof row.source==='string'?row.source:row.source?.url;if((kind==='soda'||row.localDish)&&raw){try{const u=new URL(raw);if(['https:','http:'].includes(u.protocol)){const a=node('a',kind==='soda'?'產品資料來源 ↗':'料理資料來源 ↗');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';e.append(a);}}catch{}}
  return e;
 }
 async function draw(){const id=++request;controller?.abort();controller=new AbortController();list.setAttribute('aria-busy','true');status.textContent='正在翻閱紀錄…';prev.disabled=next.disabled=true;
  try{const apiPage=Math.floor(page*perPage()/12),key=kind+':'+apiPage;let data=cache.get(key);if(!data){data=await get({kind,page:String(apiPage)},controller.signal);if(id===request)cache.set(key,data);}if(id!==request||!dialog.open)return;total=data.total;const offset=(page*perPage())%12;const cards=data.items.slice(offset,offset+perPage()).map(card);await window.HunemDialogPaging?.prepare(cards);if(id!==request||!dialog.open)return;list.replaceChildren(...cards);list.scrollTop=0;status.textContent=data.total?`第 ${page+1} / ${Math.ceil(data.total/perPage())} 頁 · 共 ${data.total} 種 · ${data.totalOccurrences} 次紀錄`:(kind==='meal'?'第一餐的紀錄還在路上。':'第一瓶汽水的紀錄還在路上。');prev.disabled=page===0;next.disabled=(page+1)*perPage()>=data.total;}
  catch(error){if(id!==request||error.name==='AbortError')return;status.textContent=error.message;const retry=node('button','重新載入');retry.type='button';retry.onclick=draw;list.replaceChildren(retry);prev.disabled=page===0;}
  finally{if(id===request)list.removeAttribute('aria-busy');}
 }
 function open(type,event){cache.clear();kind=type;dialog.setAttribute('data-kind',type);page=0;opener=event.currentTarget;$('collections-title').textContent=type==='meal'?'餐點紀錄':'汽水圖鑑';$('collections-note').textContent=type==='meal'?'只收藏有來源的具名地方料理，記錄吃完時間並畫專屬速寫；重吃沿用圖片並累計次數。麵包與熱飲、午間套餐等虛擬餐點不列入。時間以柏林時區顯示。':'依購買時間記錄每款汽水與次數，首次購買後畫瓶罐速寫；每天的飲用仍依原作息進行。時間以柏林時區顯示。';if(!dialog.open)dialog.showModal();document.body.classList.add('collections-open');draw();}
 $('open-meals').onclick=e=>open('meal',e);$('open-sodas').onclick=e=>open('soda',e);$('close-collections').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{document.body.classList.remove('collections-open');request++;controller?.abort();list.replaceChildren();list.removeAttribute('aria-busy');opener?.focus();});
 prev.onclick=()=>{if(page>0){page--;draw();}};next.onclick=()=>{if(!next.disabled){page++;draw();}};
 function turn(direction){if(direction<0){if(!prev.disabled)prev.onclick();}else if(!next.disabled)next.onclick();}
 dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();turn(event.key==='ArrowLeft'?-1:1);}});
 let touch=null;list.addEventListener('touchstart',event=>{if(event.target.closest('a,button,details'))return;touch={x:event.changedTouches[0].clientX,y:event.changedTouches[0].clientY};},{passive:true});
 list.addEventListener('touchend',event=>{if(!touch)return;const dx=event.changedTouches[0].clientX-touch.x,dy=event.changedTouches[0].clientY-touch.y;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)turn(dx<0?1:-1);touch=null;},{passive:true});
 mobile.addEventListener('change',()=>{page=0;if(dialog.open)draw();});
 function updateHeld(held){const key=JSON.stringify(held||null);if(key===heldKey)return;heldKey=key;$('sodas-held').textContent=held?'目前持有：'+held.name+(held.flavour?' · '+held.flavour:''):'目前沒有持有汽水';}
 window.HunemCollections={updateCities,updateHeld,refresh(){if(summaryPending||Date.now()-lastSummary<60000)return;lastSummary=Date.now();summaryPending=true;get({mode:'summary'}).then(data=>{$('meals-total').textContent=`${data.meal.total} 道 · ${data.meal.totalOccurrences} 餐`;$('sodas-total').textContent=`${data.soda.total} 款 · 購買 ${data.soda.totalOccurrences} 次`;if(dialog.open){cache.clear();draw();}}).catch(()=>{$('meals-total').textContent='點開查看紀錄';$('sodas-total').textContent='點開查看圖鑑';}).finally(()=>{summaryPending=false;});}};
})();

(()=>{
 const dialog=document.getElementById('footprints-dialog'),list=document.getElementById('footprints-list'),status=document.getElementById('footprints-status'),prev=document.getElementById('footprints-prev'),next=document.getElementById('footprints-next'),total=document.getElementById('footprints-total');
 if(!dialog)return;
 const mapToggle=document.getElementById('toggle-map-footprints'),visibilityKey='hunem.map.footprints.visible';
 let mapVisible=true;try{mapVisible=localStorage.getItem(visibilityKey)!=='false';}catch{}
 function updateToggle(){if(!mapToggle)return;mapToggle.textContent=mapVisible?'隱藏景點':'顯示景點';mapToggle.setAttribute('aria-pressed',String(mapVisible));}
 updateToggle();
 const perPage=()=>4,bookCache=new Map();
 let listController,clusterArea=null;
 let map,googleMode=false,markers=new Map(),timer,lastRefresh=0,page=0,selected=null,listRequest=0,mapRequest=0,mapController,opener;
 let mapFlight=null,mapQueued=false,appliedMapKey=null;
 const fmt=new Intl.DateTimeFormat('zh-TW',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 async function get(params,signal){const r=await fetch('/api/footprints?'+new URLSearchParams(params),{signal,cache:'no-store'});if(!r.ok)throw Error('足跡暫時無法載入，請稍後重試。');return r.json();}
 async function drawList(){
  const request=++listRequest;listController?.abort();listController=new AbortController();status.textContent='正在翻閱足跡…';prev.disabled=next.disabled=true;
  try{const apiPage=Math.floor(page*perPage()/12),key=selected?'id:'+selected:'area:'+(clusterArea?.join(',')||'all')+':'+apiPage,cached=bookCache.get(key);let data=cached?.expiresAt>Date.now()?cached.data:null;if(!data){data=await get(selected?{id:selected}:{page:String(apiPage),...(clusterArea?{area:clusterArea.join(',')}:{})},listController.signal);if(request===listRequest)bookCache.set(key,{data,expiresAt:Date.now()+30000});}if(request!==listRequest||!dialog.open)return;
   const cards=[];total.textContent=`${data.overallTotal??data.total} 個景點`;
   const offset=selected?0:(page*perPage())%12;for(const row of data.items.slice(offset,offset+(selected?1:perPage()))){const card=el('article');card.className='footprint-card album-page';const title=el('h3',row.displayName||row.name),location=el('p',row.locationLabel||'城鎮待確認-地區待確認-國家待確認');location.className='footprint-locality';card.append(title,location);
    if(row.image){const link=el('a');link.href=row.image.src;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label','開啟'+row.name+'速寫原圖');const img=el('img');img.src=window.HunemDialogPaging?.source(row.image.src)||row.image.src;img.alt=row.name+'專屬旅行速寫';img.loading='lazy';img.decoding='async';img.width=row.image.width;img.height=row.image.height;link.append(img);card.append(link,el('p','點圖查看原圖'));}
    else{const pending=el('div','已留下足跡，專屬速寫待繪製');pending.className='footprint-pending';card.append(pending);}
    card.append(el('p',`${row.visits.length} 次參觀 · 柏林時間`));
    const history=el('details');history.append(el('summary','每次參觀紀錄'));for(const at of row.visits){const time=el('time',fmt.format(at)+' 參觀過');time.dateTime=new Date(at).toISOString();history.append(time);}card.append(history);
    if(!row.p)card.append(el('small','原紀錄未保存精確座標，暫不標在地圖上。'));
    cards.push(card);
   }
   window.HunemDialogPaging?.prepare(cards);if(request!==listRequest||!dialog.open)return;list.replaceChildren(...cards);list.scrollTop=0;
   status.textContent=data.total?(selected?'景點參觀紀錄':`第 ${page+1} / ${Math.ceil(data.total/perPage())} 頁 · 共 ${data.total} 個景點`):'第一個旅行足跡還在路上。';prev.disabled=selected?page===0:page===0;next.disabled=!!selected||(page+1)*perPage()>=data.total;
  }catch(e){if(request!==listRequest||e.name==='AbortError')return;status.textContent=e.message;const retry=el('button','重新載入');retry.type='button';retry.onclick=drawList;list.replaceChildren(retry);}
 }
 function open(id=null,source=null,area=null){selected=id;clusterArea=area;page=0;opener=source||document.getElementById('open-footprints');if(!dialog.open)dialog.showModal();document.body.classList.add('footprints-open');drawList();}
 document.getElementById('open-footprints').onclick=e=>open(null,e.currentTarget);
 document.getElementById('close-footprints').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{document.body.classList.remove('footprints-open');listRequest++;listController?.abort();list.replaceChildren();opener?.focus();});
 prev.onclick=()=>{if(page>0){page--;drawList();}};next.onclick=()=>{if(!next.disabled){page++;drawList();}};
 function turn(direction){if(direction<0){if(!prev.disabled)prev.onclick();}else if(!next.disabled)next.onclick();}
 dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();turn(event.key==='ArrowLeft'?-1:1);}});
 let touch=null;list.addEventListener('touchstart',event=>{if(event.target.closest('a,button,details'))return;touch={x:event.changedTouches[0].clientX,y:event.changedTouches[0].clientY};},{passive:true});
 list.addEventListener('touchend',event=>{if(!touch)return;const dx=event.changedTouches[0].clientX-touch.x,dy=event.changedTouches[0].clientY-touch.y;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)turn(dx<0?1:-1);touch=null;},{passive:true});
 function remove(m){if(googleMode)m.setMap(null);else map.removeLayer(m);}
 const pinImages=new Map();
 function pinSvg(image=''){return '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50"><defs><clipPath id="photo"><circle cx="20" cy="19" r="16.5"/></clipPath></defs><path d="M20 48C17 42 2 31 2 19A18 18 0 0 1 38 19C38 31 23 42 20 48Z" fill="#fffaf0" stroke="#8a7552" stroke-width="1.25" stroke-linejoin="round"/>'+ (image?'<image href="'+image+'" x="3.5" y="2.5" width="33" height="33" preserveAspectRatio="xMidYMid meet" clip-path="url(#photo)"/>':'<path d="m20 11 2.3 5.7L28 19l-5.7 2.3L20 27l-2.3-5.7L12 19l5.7-2.3Z" fill="#ad9666"/>')+'</svg>';}

 function pinUrl(svg){return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);}
 function photoPin(url){if(!pinImages.has(url)){const promise=fetch(url).then(r=>{if(!r.ok)throw Error('Thumbnail unavailable');return r.blob();}).then(blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(pinUrl(pinSvg(reader.result)));reader.onerror=reject;reader.readAsDataURL(blob);}));pinImages.set(url,promise);promise.catch(()=>pinImages.delete(url));if(pinImages.size>150)pinImages.delete(pinImages.keys().next().value);}return pinImages.get(url);}
 function make(row){
  const cluster=row.count>1,title=cluster?`${row.count} 個足跡，點擊展開`:row.name,click=()=>{if(cluster){const zoom=map.getZoom(),max=googleMode?(map.get?.('maxZoom')??22):(map.getMaxZoom?.()??18),b=row.bounds,overlap=b&&Math.abs(b[2]-b[0])<1e-7&&Math.abs(b[3]-b[1])<1e-7;if(overlap||zoom>=18||zoom>=max){open(null,null,b);return;}if(b&&map.fitBounds){if(googleMode)map.fitBounds({west:b[0],south:b[1],east:b[2],north:b[3]},64);else map.fitBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[64,64],maxZoom:18});}else{const nextZoom=Math.min(max,Math.floor(zoom)+2);if(googleMode){map.setCenter({lat:row.p[1],lng:row.p[0]});map.setZoom(nextZoom);}else map.setView([row.p[1],row.p[0]],nextZoom);}}else open(row.id);};
  if(googleMode){const icon=cluster?{path:google.maps.SymbolPath.CIRCLE,scale:19,fillColor:'#e5d4aa',fillOpacity:1,strokeColor:'#9b8158',strokeWeight:1}:{url:pinUrl(pinSvg()),scaledSize:new google.maps.Size(44,55),anchor:new google.maps.Point(22,53.9)};const m=new google.maps.Marker({map,position:{lat:row.p[1],lng:row.p[0]},title,icon,zIndex:0,label:cluster?{text:String(row.count),color:'#4d442e'}:undefined});if(!cluster&&row.image)photoPin(row.image.thumbnail).then(url=>{if(m.getMap())m.setIcon({url,scaledSize:new google.maps.Size(44,55),anchor:new google.maps.Point(22,53.9)});}).catch(()=>{});m.addListener('click',click);return m;}
  const root=el('div');if(cluster){root.className='footprint-cluster';root.textContent=String(row.count);}else{root.className='footprint-single-pin';const img=el('img');img.src=pinUrl(pinSvg());img.alt='';img.width=44;img.height=55;root.append(img);if(row.image)photoPin(row.image.thumbnail).then(url=>{img.src=url;}).catch(()=>{});}
  const size=cluster?38:44,m=L.marker([row.p[1],row.p[0]],{pane:'footprints',title,icon:L.divIcon({className:'footprint-marker',html:root,iconSize:[size,cluster?size:55],iconAnchor:[size/2,cluster?size/2:53.9]})}).addTo(map).bindTooltip(el('span',title));m.on('click',click);return m;
 }
 function mapView(){
  if(!map||!mapVisible)return null;const b=map.getBounds();if(!b)return null;
  const bounds=googleMode?{west:b.getSouthWest().lng(),south:b.getSouthWest().lat(),east:b.getNorthEast().lng(),north:b.getNorthEast().lat()}: {west:Math.max(-180,b.getWest()),south:Math.max(-90,b.getSouth()),east:Math.min(180,b.getEast()),north:Math.min(90,b.getNorth())};
  const params={mode:'map',...Object.fromEntries(Object.entries(bounds).map(([k,v])=>[k,String(v)])),zoom:String(Math.floor(map.getZoom()))};
  const key=[...Object.values(bounds).map(v=>v.toFixed(6)),params.zoom].join(':');return {params,key};
 }
 async function drawMap(){
  const view=mapView();if(!view)return;if(mapFlight){if(mapFlight.key!==view.key)mapQueued=true;return;}if(view.key===appliedMapKey)return;
  const request=++mapRequest,controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),15000);mapController=controller;mapFlight={key:view.key,request};mapQueued=false;
  try{const data=await get(view.params,controller.signal);if(request!==mapRequest||mapView()?.key!==view.key)return;
   if(!mapVisible)return;total.textContent=`${data.total} 個景點`;const keep=new Set();for(const row of data.points){const key=row.id+':'+(row.image?.sha256||'pending')+':'+row.count;keep.add(key);if(!markers.has(key))markers.set(key,make(row));}
   for(const [key,m] of markers)if(!keep.has(key)){remove(m);markers.delete(key);}
   appliedMapKey=view.key;
  }catch(e){if(request===mapRequest){total.textContent=e.name==='AbortError'?'景點載入逾時，移動地圖可重試':'暫時無法載入';}}
  finally{clearTimeout(deadline);if(mapFlight?.request===request){mapFlight=null;mapController=null;const latest=mapView();if(latest&&(mapQueued||latest.key!==view.key)){mapQueued=false;schedule();}}}
 }
 // Movement queues the newest viewport; it never aborts a useful in-flight read.
 const schedule=()=>{clearTimeout(timer);if(mapVisible)timer=setTimeout(drawMap,300);};
 const invalidate=schedule;
 if(mapToggle)mapToggle.onclick=()=>{mapVisible=!mapVisible;try{localStorage.setItem(visibilityKey,String(mapVisible));}catch{}updateToggle();clearTimeout(timer);appliedMapKey=null;if(mapVisible)schedule();else{mapRequest++;mapController?.abort();mapFlight=null;mapQueued=false;for(const marker of markers.values())remove(marker);markers.clear();}};
 window.HunemFootprints={init(m,g){if(map)return;map=m;googleMode=g;if(g){map.addListener('bounds_changed',invalidate);map.addListener('idle',schedule);}else{if(!map.getPane('footprints')){map.createPane('footprints');map.getPane('footprints').style.zIndex=590;}map.on('movestart zoomstart move zoom',invalidate);map.on('moveend zoomend',schedule);}schedule();},refresh(){if(Date.now()-lastRefresh<60000)return;lastRefresh=Date.now();appliedMapKey=null;schedule();if(dialog.open){bookCache.clear();drawList();}}};
})();

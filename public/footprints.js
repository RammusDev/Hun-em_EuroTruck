(()=>{
 const dialog=document.getElementById('footprints-dialog'),list=document.getElementById('footprints-list'),status=document.getElementById('footprints-status'),prev=document.getElementById('footprints-prev'),next=document.getElementById('footprints-next'),total=document.getElementById('footprints-total');
 if(!dialog)return;
 let map,googleMode=false,markers=new Map(),timer,lastRefresh=0,page=0,selected=null,listRequest=0,mapRequest=0,mapController,opener;
 const fmt=new Intl.DateTimeFormat('zh-TW',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 async function get(params,signal){const r=await fetch('/api/footprints?'+new URLSearchParams(params),{signal,cache:'no-store'});if(!r.ok)throw Error('足跡暫時無法載入，請稍後重試。');return r.json();}
 async function drawList(){
  const request=++listRequest;status.textContent='正在翻閱足跡…';prev.disabled=next.disabled=true;
  try{const data=await get(selected?{id:selected}:{page:String(page)});if(request!==listRequest)return;
   list.replaceChildren();total.textContent=`${data.total} 個景點`;
   for(const row of data.items){const card=el('article');card.className='footprint-card';const title=el('h3',row.name);card.append(title);
    if(row.image){const link=el('a');link.href=row.image.src;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label','開啟'+row.name+'速寫原圖');const img=el('img');img.src=row.image.src;img.alt=row.name+'專屬旅行速寫';img.loading='lazy';img.decoding='async';img.width=row.image.width;img.height=row.image.height;link.append(img);card.append(link,el('p','點圖查看原圖'));}
    else{const pending=el('div','已留下足跡，專屬速寫待繪製');pending.className='footprint-pending';card.append(pending);}
    card.append(el('p',`${row.visits.length} 次參觀 · 柏林時間`));
    for(const at of row.visits){const time=el('time',fmt.format(at)+' 參觀過');time.dateTime=new Date(at).toISOString();card.append(time);}
    if(!row.p)card.append(el('small','原紀錄未保存精確座標，暫不標在地圖上。'));
    list.append(card);
   }
   status.textContent=data.total?(selected?'景點參觀紀錄':`第 ${page+1} 頁 · 共 ${data.total} 個景點`):'第一個旅行足跡還在路上。';prev.disabled=selected?page===0:page===0;next.disabled=!!selected||!data.hasMore;
  }catch(e){if(request!==listRequest)return;status.textContent=e.message;const retry=el('button','重新載入');retry.type='button';retry.onclick=drawList;list.replaceChildren(retry);}
 }
 function open(id=null,source=null){selected=id;page=0;opener=source||document.getElementById('open-footprints');if(!dialog.open)dialog.showModal();drawList();}
 document.getElementById('open-footprints').onclick=e=>open(null,e.currentTarget);
 document.getElementById('close-footprints').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{listRequest++;list.replaceChildren();opener?.focus();});
 prev.onclick=()=>{if(page>0){page--;drawList();dialog.scrollTop=0;}};next.onclick=()=>{page++;drawList();dialog.scrollTop=0;};
 function remove(m){if(googleMode)m.setMap(null);else map.removeLayer(m);}
 function make(row){
  const cluster=row.count>1,title=cluster?`${row.count} 個足跡，點擊展開`:row.name,click=()=>{if(cluster){if(googleMode){map.setCenter({lat:row.p[1],lng:row.p[0]});map.setZoom(Math.min(20,map.getZoom()+2));}else map.setView([row.p[1],row.p[0]],Math.min(20,map.getZoom()+2));if(map.getZoom()>=20)open();}else open(row.id);};
  if(googleMode){const icon=row.image?{url:row.image.thumbnail,scaledSize:new google.maps.Size(44,44)}:{path:google.maps.SymbolPath.CIRCLE,scale:cluster?19:12,fillColor:'#e5d4aa',fillOpacity:1,strokeColor:'#9b8158',strokeWeight:1};const m=new google.maps.Marker({map,position:{lat:row.p[1],lng:row.p[0]},title,icon,zIndex:0,label:cluster?{text:String(row.count),color:'#4d442e'}:undefined});m.addListener('click',click);return m;}
  const root=el('div');if(cluster){root.className='footprint-cluster';root.textContent=String(row.count);}else if(row.image){const img=el('img');img.src=row.image.thumbnail;img.alt='';root.append(img);}else{root.className='footprint-pin';root.textContent='✧';}
  const size=cluster?38:44,m=L.marker([row.p[1],row.p[0]],{pane:'footprints',title,icon:L.divIcon({className:'footprint-marker',html:root,iconSize:[size,size],iconAnchor:[size/2,size/2]})}).addTo(map).bindTooltip(el('span',title));m.on('click',click);return m;
 }
 async function drawMap(){
  if(!map)return;const b=map.getBounds();if(!b)return;
  const bounds=googleMode?{west:b.getSouthWest().lng(),south:b.getSouthWest().lat(),east:b.getNorthEast().lng(),north:b.getNorthEast().lat()}: {west:Math.max(-180,b.getWest()),south:Math.max(-90,b.getSouth()),east:Math.min(180,b.getEast()),north:Math.min(90,b.getNorth())};
  const request=++mapRequest;mapController?.abort();mapController=new AbortController();
  try{const data=await get({mode:'map',...Object.fromEntries(Object.entries(bounds).map(([k,v])=>[k,String(v)])),zoom:String(map.getZoom())},mapController.signal);if(request!==mapRequest)return;
   total.textContent=`${data.total} 個景點`;const keep=new Set();for(const row of data.points){const key=row.id+':'+(row.image?.sha256||'pending')+':'+row.count;keep.add(key);if(!markers.has(key))markers.set(key,make(row));}
   for(const [key,m] of markers)if(!keep.has(key)){remove(m);markers.delete(key);}
  }catch(e){if(e.name!=='AbortError')total.textContent='暫時無法載入';}
 }
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(drawMap,250);};
 window.HunemFootprints={init(m,g){if(map)return;map=m;googleMode=g;if(g)map.addListener('idle',schedule);else{if(!map.getPane('footprints')){map.createPane('footprints');map.getPane('footprints').style.zIndex=590;}map.on('moveend zoomend',schedule);}schedule();},refresh(){if(Date.now()-lastRefresh<60000)return;lastRefresh=Date.now();schedule();if(dialog.open)drawList();}};
})();

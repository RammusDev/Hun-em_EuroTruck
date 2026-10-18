(()=>{
 let photos=[],page=0,opener=null,turning=false,closing=false;
 const dialog=document.getElementById('album-dialog'),book=document.getElementById('album-book'),spread=document.getElementById('album-spread'),counter=document.getElementById('album-counter'),prev=document.getElementById('album-prev'),next=document.getElementById('album-next'),empty=document.getElementById('album-empty');
 const mobile=matchMedia('(max-width:700px)'),perPage=()=>mobile.matches?1:2;
 const draw=()=>{
  const per=perPage(),total=Math.max(1,Math.ceil(photos.length/per));page=Math.max(0,Math.min(page,total-1));spread.replaceChildren();empty.hidden=photos.length>0;book.hidden=!photos.length;
  for(let i=0;i<per;i++){
   const index=page*per+i,art=photos[index],sheet=document.createElement('div');sheet.className='album-page '+(i?'right-page':'left-page');
   if(art){const figure=document.createElement('figure'),mount=document.createElement('div'),img=document.createElement('img'),caption=document.createElement('figcaption'),title=document.createElement('p'),date=document.createElement('p');
    mount.className='album-mount';img.src=art.src;img.alt=art.alt;img.width=1254;img.height=1254;img.draggable=false;mount.append(img);title.className='album-caption';title.textContent=`${art.country}－${art.city}－${art.name}`;
    date.className='album-date';const time=art.drawnAt?new Intl.DateTimeFormat('zh-TW',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(art.drawnAt):art.drawnOn.replaceAll('-',' / ');date.textContent=time;caption.append(title,date);figure.append(mount,caption);sheet.append(figure);
   }else{const end=document.createElement('p');end.className='album-last';end.textContent='下一幅，留給下一段路。';sheet.append(end);}
   const folio=document.createElement('span');folio.className='album-folio';folio.textContent=String(index+1).padStart(2,'0');sheet.append(folio);spread.append(sheet);
  }
  counter.textContent=photos.length?`第 ${page+1} / ${total} 頁 · ${photos.length} 幅畫作`:'尚無畫作';prev.disabled=page===0||!photos.length;next.disabled=page>=total-1||!photos.length;
 };
 const duration=()=>matchMedia('(prefers-reduced-motion:reduce)').matches?1:1150;
 const cover=()=>{const el=document.createElement('div');el.className='album-cover';el.setAttribute('aria-hidden','true');el.innerHTML='<span>HUN-EM</span><strong>旅途速寫</strong><small>A CAT’S EUROPE</small><i>✧</i>';book.append(el);return el;};
 const animate=async(el,frames,ms=duration())=>{try{await el.animate(frames,{duration:ms,easing:'cubic-bezier(.22,.55,.2,1)',fill:'forwards'}).finished;}catch{}};
 const turn=async direction=>{
  if(turning||closing||(direction<0?prev.disabled:next.disabled))return;turning=true;
  const oldSpread=spread.cloneNode(true);oldSpread.removeAttribute('id');oldSpread.classList.add('album-outgoing');oldSpread.setAttribute('aria-hidden','true');oldSpread.inert=true;prev.disabled=next.disabled=true;book.setAttribute('aria-busy','true');
  const target=page+direction,targets=photos.slice(target*perPage(),target*perPage()+perPage());
  await Promise.all(targets.map(art=>new Promise(resolve=>{const image=new Image();image.onload=image.onerror=resolve;image.src=art.src;})));
  page=target;draw();prev.disabled=next.disabled=true;
  book.append(oldSpread);
  const ms=matchMedia('(prefers-reduced-motion:reduce)').matches?1:440;
  await Promise.all([
   animate(oldSpread,[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*28}px)`}],ms),
   animate(spread,[{opacity:.15,transform:`translateX(${direction*28}px)`},{opacity:1,transform:'translateX(0)'}],ms)
  ]);
  oldSpread.remove();spread.getAnimations().forEach(a=>a.cancel());book.removeAttribute('aria-busy');turning=false;draw();
 };
 document.getElementById('open-album').onclick=async e=>{if(dialog.open)return;opener=e.currentTarget;draw();dialog.showModal();document.body.classList.add('album-open');turning=true;prev.disabled=next.disabled=true;dialog.classList.add('album-opening');const el=cover();await animate(el,[{transform:'rotateY(0deg)'},{transform:'rotateY(-180deg)'}]);el.remove();dialog.classList.remove('album-opening');turning=false;draw();};
 const close=async()=>{if(closing||turning)return;closing=true;prev.disabled=next.disabled=true;dialog.classList.add('album-closing');const el=cover();await animate(el,[{transform:'rotateY(-180deg)'},{transform:'rotateY(0deg)'}]);await animate(dialog,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(18px)'}],matchMedia('(prefers-reduced-motion:reduce)').matches?1:220);el.remove();dialog.classList.remove('album-closing');dialog.getAnimations().forEach(a=>a.cancel());dialog.close();closing=false;};
 document.getElementById('close-album').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('close',()=>{document.body.classList.remove('album-open');opener?.focus();});
 prev.onclick=()=>turn(-1);next.onclick=()=>turn(1);dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();turn(-1);}if(e.key==='ArrowRight'){e.preventDefault();turn(1);}});
 let touch=null;spread.addEventListener('touchstart',e=>{touch={x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY};},{passive:true});spread.addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)turn(dx<0?1:-1);touch=null;},{passive:true});
 mobile.addEventListener('change',()=>{if(!turning&&!closing){page=0;draw();}});
 window.HunemAlbum={update(items){const old=photos.map(p=>p.id).join('|'),fresh=items.map(p=>p.id).join('|');photos=items;if(dialog.open&&old!==fresh&&!turning&&!closing)draw();document.getElementById('album-total').textContent=`${photos.length} 幅旅行速寫`;}};
})();

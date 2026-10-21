(()=>{
 const events=[];
 const safe=value=>{try{return typeof value==='string'?value:JSON.stringify(value);}catch{return String(value);}};
 const record=(kind,details)=>{events.push({at:new Date().toISOString(),kind,details:safe(details).slice(0,4000)});if(events.length>100)events.shift();};
 window.addEventListener('error',e=>record('browser-error',{message:e.message,stack:e.error?.stack,file:e.filename,line:e.lineno,column:e.colno}));
 window.addEventListener('unhandledrejection',e=>record('unhandled-rejection',{message:e.reason?.message||safe(e.reason),stack:e.reason?.stack}));
 window.addEventListener('error',e=>{if(e.target!==window)record('resource-error',{tag:e.target?.tagName,src:e.target?.src||e.target?.href});},true);
 for(const level of ['warn','error']){const original=console[level].bind(console);console[level]=(...args)=>{record('console-'+level,args.map(safe));original(...args);};}
 window.HunemDebug={record};
 const button=document.getElementById('download-debug'),status=document.getElementById('debug-status');
 if(button&&status)button.onclick=async()=>{
  button.disabled=true;status.textContent='正在整理除錯資料…';record('download-request',{});
  try{
   const client={url:location.origin+location.pathname,userAgent:navigator.userAgent,language:navigator.language,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,viewport:{width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio,scrollX,scrollY},online:navigator.onLine,events,view:Object.fromEntries(['clock','status','route-title','catalog-note','message','diary-title','provider','map-error'].map(id=>[id,document.getElementById(id)?.textContent?.slice(0,3000)])),images:[...document.querySelectorAll('#journal-art img')].map(i=>({src:i.getAttribute('src'),complete:i.complete,naturalWidth:i.naturalWidth})),zhuyin:document.getElementById('zhuyin-toggle')?.checked};
   const response=await fetch('/api/debug',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(client)});if(!response.ok)throw Error('HTTP '+response.status);
   const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='hunem-debug-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='除錯檔已準備好下載。請保留檔案並描述出問題前的操作。';
  }catch(e){record('download-error',e.message);status.textContent='下載失敗。可試下方備用下載；伺服器無法啟動時，在專案目錄執行 npm run debug:export。';}
  finally{button.disabled=false;}
 };
})();

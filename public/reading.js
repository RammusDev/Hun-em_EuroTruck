// Large pronunciation dictionaries load only when a reader requests zhuyin.
(()=>{
 let loading=null;
 const cache=new Map(),key=d=>JSON.stringify([d.title,d.zh,(d.illustrations||[]).map(a=>a.caption)]);
 function load(){
  if(window.HunemZhuyin)return Promise.resolve(window.HunemZhuyin);
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='/zhuyin-client.js';script.async=true;
   const timeout=setTimeout(()=>fail(),30000);
   const fail=()=>{clearTimeout(timeout);script.remove();loading=null;reject(Error('注音暫時無法載入，請關閉後重新開啟再試。'));};
   script.onerror=fail;script.onload=()=>{clearTimeout(timeout);if(window.HunemZhuyin)resolve(window.HunemZhuyin);else fail();};document.head.append(script);
  });
  return loading;
 }
 window.HunemReading={
  get(d){return d.zhuyin?d:cache.has(key(d))?{...d,zhuyin:cache.get(key(d))}:d;},
  async prepare(d){if(d.zhuyin)return d;const id=key(d);if(!cache.has(id)){const module=await load();if(!cache.has(id))cache.set(id,module.withZhuyin(d).zhuyin);if(cache.size>100)cache.delete(cache.keys().next().value);}return {...d,zhuyin:cache.get(id)};}
 };
})();

// One click path for mouse, synthesized touch clicks and keyboard activation.
// Native details remain usable when this optional enhancement is unavailable.
(()=>{
 const root=document.querySelector('.city-directory');
 if(!root||root.dataset.enhanced)return;
 root.dataset.enhanced='true';
 const trigger=root.querySelector(':scope > summary');
 const close=()=>{root.open=false;trigger?.focus({preventScroll:true});};
 root.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  if(target?.closest('[data-close-city-directory]')){event.preventDefault();close();return;}
  const summary=target?.closest('summary'),details=summary?.parentElement;
  if(!details||!root.contains(summary)||(details!==root&&!details.classList.contains('city-country')))return;
  // Cancel native toggling so nested text/arrow taps each change exactly one row.
  event.preventDefault();details.open=!details.open;
 });
 document.addEventListener('click',event=>{
  if(root.open&&event.target instanceof Node&&!root.contains(event.target))root.open=false;
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&root.open){event.preventDefault();close();}
 });
})();

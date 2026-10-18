// Presentation only; never changes work, time, or persistent character state.
(() => {
 const root='/site-art/';
 const clock=new Intl.DateTimeFormat('en',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'});
 function working(s){
  if(!s?.job||s.travel||s.outing||s.atHome||s.duty?.closed||s.mealPause)return false;
  if(s.operation?.kind==='work_break'||s.job.journey?.phase==='ferry')return false;
  const hour=Number(clock.formatToParts(s.now).find(p=>p.type==='hour')?.value);
  return hour>=8&&hour<16;
 }
 globalThis.HunemAppearance={working,markerSource:s=>root+(working(s)?'avatar-work.webp':'avatar-rest.webp')};
})();

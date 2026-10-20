// Explicit diagnostic allowlist: never return the full world or browser state.
const number=v=>Number.isFinite(v)?v:null;
const point=v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)?[...v]:null;
const text=v=>typeof v==='string'?v:null;
export function journeyStatus(payload,view,observedAt=Date.now()){
 const s=payload.eventArchitecture?{...payload.world,...view}:payload.world,o=s.outing,day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(s.now);
 const plan=s.tourPlans?.[day]||s.leisurePlans?.[day],a=view.activity;
 const phase=s.operation?'operation':s.mealPause?'meal':a?.kind||view.travel?.mode||(s.job?'work':'rest');
 const stage=s.operation||s.mealPause||o||view.travel;
 const bg=payload.backgroundTicks?.lastReceipt;
 return {
  statusVersion:2,
  observedAt,timeZone:'Europe/Berlin',
  location:{cityId:text(view.personCity||s.location),personPosition:point(view.position),truckPosition:point(view.truckPosition),atHome:!!view.atHome},
  activity:{status:text(view.status),phase:text(phase),title:text(a?.title),detail:text(a?.detail),target:text(o?.place?.name||a?.target),startsAt:number(stage?.start),endsAt:number(stage?.end||a?.until),transportMode:text(o?.transportMode),waitingUntil:o?.phase==='outbound'?number(o.start+(o.waitMinutes||0)*60000):null},
  tour:plan?{kind:text(plan.kind),cityId:text(plan.cityId),startedAt:number(plan.startedAt),returnBy:number(plan.returnBy),finishedAt:number(plan.finishedAt),completedStops:Array.isArray(plan.completed)?plan.completed.length:0}:null,
  work:s.job?{from:text(s.job.from),to:text(s.job.to),phase:text(s.job.journey?.phase),startedAt:number(s.job.start),progress:number(view.progress)}:null,
  sync:{source:'committed-snapshot',lastAccountedRealAt:number(s.realAt),lagMs:Number.isFinite(s.realAt)?Math.max(0,observedAt-s.realAt):null,speed:number(s.speed),paused:s.speed===0,lastBackground:bg?{acceptedAt:number(bg.acceptedAt),worldTime:number(bg.now),lagMs:number(bg.lagMs),action:text(bg.action)}:null},
  recentMovementEvents:(s.events||[]).filter(e=>['delivered','walk_started','tour_plan_changed','tour_stage_started','tour_returned','visit','meal_finished','route_failed'].includes(e.type)).slice(-8).map(e=>({type:text(e.type),time:number(e.time),name:text(e.name||e.place?.name),location:text(e.location)})),
 };
}

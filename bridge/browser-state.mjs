// Presentation projection only; the full persisted world and routes stay intact.
import {placeNames} from './place-name-catalog.mjs';
const namesById=new Map(placeNames.cities.map(c=>[c.id,c.name]));
export function browserState(view){
 const result={...view};
 // The complete catalog is bundled server-side; readers only need map/label fields.
 // The static header directory is independent of state polling and animation.
 if(view.cities)result.cities=view.cities.map(({id,name,latin,p,country})=>({id,name:namesById.get(id)||name,latin,p,country}));
 const bottle=view.sodaLife?.bottle;
 result.heldSoda=bottle?{name:bottle.name,brand:bottle.brand,flavour:bottle.flavour}:null;
 for(const key of ['pendingMeals','economy','truck','visits','sodaLife','leisurePlans','tourPlans','journalLegacyGrammarIds'])delete result[key];
 if(view.holidayDecisions)result.holidayDecisions=view.holidayDecisions.slice(-1);
 if(view.job){
  const job={...view.job,route:{...view.job.route}};delete job.route.segments;
  if(view.job.journey){const j=view.job.journey;job.journey={...j,legs:j.legs.map((leg,i)=>i===j.index?leg:null)};}
  result.job=job;
 }
 if(view.pendingJob?.validatedRoute)result.pendingJob={...view.pendingJob,validatedRoute:{verified:true}};
 return result;
}

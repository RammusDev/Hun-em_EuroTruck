export const error=(message,status=403)=>Object.assign(new Error(message),{status});
const serviceScopes={
 '/api/worker':['sync'], '/api/publication':['publication'], '/api/object':['publication'], '/api/research':['sync'],
 '/api/state':['sync'],
};
const ownerRoutes=new Set(['/api/export','/api/config','/api/debug','/api/retry-route','/api/update-drink-preferences']);
const forbiddenRoutes=new Set(['/api/reset-world','/api/correct-start','/api/import','/api/control']);
export function authorizeWorld(actor,method,path){
 if(!actor)throw error('請先登入',401);
 if(forbiddenRoutes.has(path))throw error('此正式世界維護操作不對外提供');
 if(method==='GET'&&path==='/api/health')return 'health';
 if(actor.role==='service'){
  if(!['GET','POST'].includes(method)||!serviceScopes[path]?.some(s=>actor.scopes.includes(s)))throw error('Service scope denied');
  if(method==='POST'&&!['/api/publication','/api/object'].includes(path))throw error('Service method denied');return 'service';
 }
 if(ownerRoutes.has(path)){if(actor.owner&&actor.adminFresh)return 'owner';throw error('需要擁有者最近30分鐘內登入');}
 if(path==='/api/worker'||path==='/api/publication'||path==='/api/research'||path==='/api/object'){if(actor.owner&&actor.adminFresh)return 'owner';throw error('發布與同步操作僅限擁有者或服務');}
 if(method==='GET'&&path==='/api/state'&&actor.reader)return actor.owner&&actor.adminFresh?'owner':'reader';
 throw error('Not found',404);
}
export function publicReaderView(view){
 const safe={};
 // Explicit top-level allowlist; never publish arbitrary future runtime fields.
 for(const k of ['activity','now','realAt','speed','position','status','balance','fuel','heldSoda','job','diaries','cities','album','googleKey','cloud','workDays','restDays','holidayUntil','holidayDecisions','offDuty','pendingJob','lastJob','ledger','events','dailyStats','homeTrip','motion','syncPending','location','stay','holiday','travel','outing','atHome','duty','finance','progress','totalKm'])if(Object.hasOwn(view,k))safe[k]=structuredClone(view[k]);
 // Internal details never form part of the reader contract.
 if(safe.pendingJob){delete safe.pendingJob.error;delete safe.pendingJob.errors;delete safe.pendingJob.retryHistory;}
 const scrub=x=>{if(!x||typeof x!=='object')return;for(const key of Object.keys(x)){if(['adminToken','publicationJobs','cloudWriting','cloudImages','cloudCandidates','files','routes','lease','token','input','error','errors','retryHistory'].includes(key))delete x[key];else scrub(x[key]);}};scrub(safe);
 for(const k of ['movementSpeedsKmH','operation','mealPause','journeyCarryMs'])if(Object.hasOwn(view,k))safe[k]=structuredClone(view[k]);
 scrub(safe);safe.viewerRole='reader';return safe;
}

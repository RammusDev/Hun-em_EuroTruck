import bundled from './static-files.json' with {type:'json'};
// Only the explicitly editable fields are hydrated; existing routes and plans stay intact.
export function syncRuntimeSettings(engine,p={}){
 const files=p.files||{},current=p.maintenance?.current||{};
 const catalog=JSON.parse((current.cities&&files['/hunem/assets/city-candidates.json'])||bundled['/hunem/assets/city-candidates.json']);
 const byId=new Map(catalog.cities.map(c=>[c.id,c]));
 for(const city of engine.cities){const row=byId.get(city.id);if(row){city.enabled=row.enabled;city.weight=row.weight;}}
 const policy=JSON.parse((current.travel&&files['/hunem/assets/travel-policy.json'])||bundled['/hunem/assets/travel-policy.json']);
 for(const key of ['visitMinutes','mealMinutes','waitMinutes','departureHour','latestReturnDepartureHour'])engine.movementPolicy.touring[key]=policy.touring[key];
 for(const key of ['routeRetryMinutes','maxRouteAttemptsPerDay'])engine.movementPolicy[key]=policy[key];
 return Object.fromEntries(Object.entries(current).map(([kind,record])=>[kind,record.hash]));
}

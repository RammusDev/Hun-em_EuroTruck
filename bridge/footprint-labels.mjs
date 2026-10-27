import {footprintLocalities,footprintCities} from './footprint-localities.mjs';
const normalize=s=>String(s||'').normalize('NFC').toLocaleLowerCase();
const sourceKey=s=>{try{return decodeURIComponent(new URL(s).href).replaceAll('_',' ');}catch{return '';}};
const known=new Map(footprintLocalities.map(p=>[sourceKey(p.source),p]));
// Presentation metadata only. A journey's cityId is not proof of a landmark's locality.
export function footprintLabels(row,world={}){
 const verified=known.get(sourceKey(row.source));
 let place=verified?.name===row.name?verified:null;
 const suffix=/\s+\(([^()]+)\)$/.exec(row.name);
 if(!place&&suffix){const matches=footprintCities.filter(c=>normalize(c.town)===normalize(suffix[1]));if(matches.length===1)place=matches[0];}
 if(!place){
  for(const entry of Object.values(world.localTopicCache||{})){
   const topic=entry.landmarks?.find(t=>[t.id,...(t.aliasIds||[])].includes(row.topicId)&&sourceKey(t.source)===sourceKey(row.source)&&t.cityEvidence?.source&&sourceKey(t.cityEvidence.source)===sourceKey(row.source));
   if(topic){place=footprintCities.find(c=>c.id===topic.cityId);if(place)break;}
  }
 }
 // Remove only a confirmed town disambiguator, retaining other meaningful parentheses.
 const displayName=place&&suffix&&normalize(suffix[1])===normalize(place.town)?row.name.slice(0,suffix.index):row.name;
 return {...row,displayName,locationLabel:place?`${place.town}-${place.region}-${place.country}`:'城鎮待確認-地區待確認-國家待確認',locality:place?{town:place.town,region:place.region,country:place.country,source:place.source||row.source}:null};
}

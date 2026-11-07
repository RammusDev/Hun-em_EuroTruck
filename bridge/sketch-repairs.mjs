// Explicit owner-confirmed recovery for one recorded meal; never rewrites world facts.
import {bodyBytes,referenceMime,referenceUrl} from './collection-reference.mjs';
export const recoveryWorld='c9181921-e285-4ada-bf6f-c763c678964e';
export const recoveryMealId='0068bfb7cc5adfbd4a129b509995729a';
export const recoveryMealName='Lachsfilet auf Kürbis-Kartoffelpuffer - mit Zucchininudeln, Salatbouquet';
export function repairSketchSubject(row,kind,worldId){
 if(kind!=='meal'||worldId!==recoveryWorld||row.id!==recoveryMealId||row.occurrences?.length!==1||row.occurrences[0].key!=='meal:meal:2026-11-07:dinner')return row;
 return {...row,name:recoveryMealName,source:'https://frankfurter-kartoffelhaus.de/speisekarte/',
  summary:'Owner confirmed the actual dish on 2026-11-07; verified against the restaurant menu. Cooked salmon fillet on pumpkin-potato pancakes, with zucchini noodles and a small leafy salad. Component photos illustrate cooked salmon and pumpkin-potato pancake texture only; they are not a photograph of the restaurant serving. Do not copy peppers, potato halves, lemon, sauces, seeds, apple sauce, bottles or tableware from reference photos. Do not invent other ingredients.',
  subjectCorrection:{originalName:'Frankfurter Kartoffelhaus',confirmedOn:'2026-11-07',scope:'meal:meal:2026-11-07:dinner',reason:'Owner supplied actual dish; restaurant name was incorrectly treated as dish'}};
}
const churchPage='https://www.altekirchen.de/offene-kirchen/kirchen/friedenskirche-frankfurt-oder';
export function reviewedReferenceSources(kind,row){
 if(row.worldId!==recoveryWorld)return null;
 if(kind==='footprint'&&row.id==='fd11c7e1b0829a05f012c61885853af7')return [{title:row.name,sourcePage:churchPage,sourceImage:'https://www.altekirchen.de/wp-content/uploads/2019/02/Frankfurt-O-Friedenskirche-830x1024.jpg',credit:'Förderkreis Alte Kirchen Berlin-Brandenburg e.V.; see source page',license:'Published church photograph; temporary visual reference only',referenceRole:'exact-landmark'}];
 if(kind==='meal'&&row.id===recoveryMealId&&row.subjectCorrection)return [
  {title:'Cooked salmon fillet appearance only',sourcePage:'https://www.essen-und-trinken.de/rezepte/59477-rzpt-lachs-mit-paprikagemuese',sourceImage:'https://image.essen-und-trinken.de/11831140/t/Ki/v9/w480/r1/-/lachs-mit-paprikagemuese-d85f5fc578fe311ce9f3c4660b391a61-fjt2014070621-jpg--8166-.jpg',credit:'Matthias Haupt / ESSEN & TRINKEN',license:'Copyright; temporary component appearance reference only',referenceRole:'cooked-salmon-component-only'},
  {title:'Pumpkin-potato pancake texture only',sourcePage:'https://www.zait.de/rezepte/kuerbis-kartoffelpuffer/',sourceImage:'https://www.zait.de/wp-content/uploads/kuerbis_kartoffel_puffer_zait_olivenoel_katalonien.webp',credit:'zait Olivenöl',license:'Copyright; temporary component appearance reference only',referenceRole:'pumpkin-potato-pancake-component-only'}];
 return null;
}
export async function reviewedSketchReference(sources,{fetcher=fetch}={}){
 const photos=[],errors=[],deadline=AbortSignal.timeout(8000),hosts=['www.altekirchen.de','www.essen-und-trinken.de','image.essen-und-trinken.de','www.zait.de'];
 for(const source of sources)try{
  referenceUrl(source.sourcePage,hosts);const url=referenceUrl(source.sourceImage,hosts);
  const response=await fetcher(url,{redirect:'manual',headers:{'User-Agent':'HunEmTravel/1.5 (owner-reviewed appearance reference)'},signal:deadline});
  const bytes=await bodyBytes(response);photos.push({...source,bytes,mimeType:referenceMime(bytes)});
 }catch(e){errors.push(/^REFERENCE_[A-Z0-9_]+$/.test(e.message)?e.message:'REFERENCE_FETCH_FAILED');}
 // Component assembly needs every explicitly listed component, never a partial plate.
 return photos.length===sources.length?{photos,errors}:{photos:[],errors};
}

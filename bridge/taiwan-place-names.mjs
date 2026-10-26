import {placeNames} from './place-name-catalog.mjs';

// Chinese aliases only: never replace Latin names, IDs, URLs or foreign prose.
export const taiwanAliases=Object.freeze({
 '克羅地亞':'克羅埃西亞','克罗地亚':'克羅埃西亞',
 '那不勒斯':'拿坡里','意大利':'義大利',
 '佛羅倫薩':'佛羅倫斯','佛罗伦萨':'佛羅倫斯',
 '波恩':'波昂','杜塞爾多夫':'杜塞道夫'
});
export const taiwanPlaceName=name=>taiwanAliases[name]||name;
export function taiwanPlaceInstruction(input){
 const context=JSON.stringify([input.events,input.writingContext,input.imageRequests]);
 const cities=placeNames.cities.filter(c=>context.includes(JSON.stringify(c.id))||[c.name,c.localName].some(n=>context.includes(n)));
 return '台灣地名規則：中文標題、正文及教材的繁中解釋使用台灣慣用譯名，以共用城市／國家表為準。不要只做簡轉繁。英、德、日正文與例句各用該語言的慣稱；原名可在必要時括註。沒有可靠中文慣稱的景點保留原名，不自行音譯。來源網址、實體ID及已發生事件不改。送稿前核對地名。已知異譯→慣用名：'+Object.entries(taiwanAliases).map(([a,b])=>a+'→'+b).join('、')+'。國家表：'+Object.entries(placeNames.countries).map(([id,name])=>id+'='+name).join('、')+'。當天相關城市（只供名稱對照，不代表已造訪）：'+cities.map(c=>c.id+' / '+c.localName+'='+c.name).join('、')+'。';
}
export function taiwanPlaceErrors(draft){
 const fields=[['title',draft.title],['zh',draft.zh]];
 for(const lang of ['en','de','ja']){
  const l=draft.learning?.[lang];
  for(const [i,pair] of (l?.grammar||[]).entries())fields.push([lang+' 繁中解析 '+(i+1),pair?.[1]]);
  for(const [i,word] of (l?.words||[]).entries()){
   const split=typeof word==='string'?word.search(/[：:]/):-1;
   if(split>=0)fields.push([lang+' 繁中詞義 '+(i+1),word.slice(split+1)]);
  }
 }
 return fields.flatMap(([field,value])=>typeof value==='string'?Object.entries(taiwanAliases).filter(([alias])=>value.includes(alias)).map(([alias,name])=>`${field==='title'?'標題':field==='zh'?'繁中正文':field}地名請使用「${name}」，取代「${alias}」`):[]);
}

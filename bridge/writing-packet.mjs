// A view of the immutable archive. Never replaces or modifies the original input.
const clone=x=>structuredClone(x);
const pick=(x,keys)=>Object.fromEntries(keys.filter(k=>x?.[k]!==undefined).map(k=>[k,clone(x[k])]));
export const publicationFlowVersion='compact-v3-direct-write';
export function creativeCharacter(markdown){
 // Remove only named operational/template sections; retain every other character section verbatim.
 return String(markdown||'').split(/(?=^#{2,3} )/m).filter(section=>{
  const heading=section.split(/\r?\n/,1)[0].trim();
  return heading!=='## 生成流程與手動編輯'&&!/^### diary-closing-(zh|en|de|ja)$/.test(heading);
 }).join('').trim();
}
export function writingPacket(input){
 return {
  version:3,flowVersion:publicationFlowVersion,id:input.id,day:input.day,character:creativeCharacter(input.character),characterRevision:input.characterRevision,
  writingInstruction:input.writingInstruction,writingPolicy:clone(input.curriculum?.writingPolicy||{}),
  learningPlan:clone(input.learningPlan),
  events:input.events.map(e=>Object.fromEntries(Object.entries(e).filter(([k])=>k!=='quote'))),
  writingContext:clone(input.writingContext),
  recentDiaries:(input.recentDiaries||[]).map(d=>pick(d,['day','title','zh','narrative','facts'])),
  imageRequests:clone(input.imageRequests),previousArt:clone(input.previousArt||[]),
  output:{title:'string',zh:'string',learning:'en/de/ja: text, grammar, grammarIds, words',review:'firstPerson, characterVoice, factsConsistent, translationsConsistent, levelChecked, grammarExplained, recentDiariesCompared, grammarUsageChecked, vocabularyChecked, focus, eventIndices, sourceKeys'},
  constraints:'事件索引與原封存相同，sourceKeys取writingContext頂層鍵。完整人物／事件封存保留不變；本閱讀版只省操作段落、模板結尾及近期外語／舊教學。詞彙一律「word：繁中意思」。自我校對後直接submit(action=write)；write會驗證，失敗只patch相關欄位後再次write，不需先validate。'
 };
}
export function mergeCandidate(base,patch){
 const d=clone(base);
 for(const k of ['title','zh'])if(Object.hasOwn(patch||{},k))d[k]=patch[k];
 for(const lang of ['en','de','ja'])for(const k of ['text','grammar','grammarIds','words'])if(Object.hasOwn(patch?.learning?.[lang]||{},k))d.learning[lang][k]=clone(patch.learning[lang][k]);
 return d;
}
export function candidateView(d){return {title:d.title,zh:d.zh,learning:Object.fromEntries(['en','de','ja'].map(l=>[l,pick(d.learning[l],['text','grammar','grammarIds','words'])]))};}
export function errorFields(errors){return [...new Set(errors.map(e=>/^(en|de|ja)/.exec(e)?.[1]||(/繁中|自我辯解/.test(e)?'zh':/標題/.test(e)?'title':'review')))];}

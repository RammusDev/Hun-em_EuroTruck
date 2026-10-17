// A view of the immutable archive. Never replaces or modifies the original input.
const clone=x=>structuredClone(x);
const pick=(x,keys)=>Object.fromEntries(keys.filter(k=>x?.[k]!==undefined).map(k=>[k,clone(x[k])]));
export function writingPacket(input){
 return {
  version:2,id:input.id,day:input.day,character:input.character,
  writingInstruction:input.writingInstruction,writingPolicy:clone(input.curriculum?.writingPolicy||{}),
  learningPlan:clone(input.learningPlan),
  events:input.events.map(e=>Object.fromEntries(Object.entries(e).filter(([k])=>k!=='quote'))),
  writingContext:clone(input.writingContext),
  recentDiaries:(input.recentDiaries||[]).map(d=>({...pick(d,['day','title','zh','narrative','facts']),learning:Object.fromEntries(Object.entries(d.learning||{}).map(([k,v])=>[k,pick(v,['text','level','grammar','grammarIds','words'])]))})),
  imageRequests:clone(input.imageRequests),previousArt:clone(input.previousArt||[]),
  output:{title:'string',zh:'string',learning:'en/de/ja: text, grammar, grammarIds, words',review:'firstPerson, characterVoice, factsConsistent, translationsConsistent, levelChecked, grammarExplained, recentDiariesCompared, grammarUsageChecked, vocabularyChecked, focus, eventIndices, sourceKeys'},
  constraints:'事件索引與原封存相同。背景引用sourceKeys使用writingContext頂層鍵。原始備用稿由伺服器保留；不要重建中繼資料。先自我校對，再validate；失敗只patch相關欄位。'
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

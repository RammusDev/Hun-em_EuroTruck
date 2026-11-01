// Only already committed diary entries; never read jobs, credentials or advance time.
export function publishedJournal(p,{day}={}){
 const diaries=p?.world?.diaries||[];
 const d=diaries.filter(d=>typeof d.day==='string'&&(!day||d.day===day)).sort((a,b)=>b.day.localeCompare(a.day))[0];
 if(!d)throw Error('PUBLISHED_JOURNAL_NOT_FOUND');
 const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,structuredClone(value[k])]));
 return {day:d.day,title:d.title,zh:d.zh,learning:Object.fromEntries(['en','de','ja'].filter(l=>d.learning?.[l]).map(l=>[l,pick(d.learning[l],['level','text','grammar','grammarIds','grammarTitles','words'])])),publication:pick(d.publication,['id','publishedAt','writing']),mutated:false};
}

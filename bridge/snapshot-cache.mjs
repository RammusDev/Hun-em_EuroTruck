// Immutable snapshot text only. The caller still reads the live D1 pointer and
// parses a fresh object on every request, so writes cannot mutate a cached world.
export function createSnapshotTextCache({maxChars=4*1024*1024}={}){
 const entries=new Map();
 return async function read(key,load){
  if(entries.has(key))return entries.get(key);
  // Only completed immutable text is reusable across requests. An in-flight
  // promise can belong to a canceled request and never settle in this isolate.
  const text=await load();
  if(text!==null&&text.length<=maxChars){entries.set(key,text);while(entries.size>2)entries.delete(entries.keys().next().value);}
  return text;
 };
}

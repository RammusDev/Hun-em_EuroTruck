// Immutable snapshot text only. The caller still reads the live D1 pointer and
// parses a fresh object on every request, so writes cannot mutate a cached world.
export function createSnapshotTextCache({maxChars=4*1024*1024}={}){
 const entries=new Map();
 return async function read(key,load){
  if(entries.has(key))return entries.get(key);
  const pending=Promise.resolve().then(load);entries.set(key,pending);
  while(entries.size>2)entries.delete(entries.keys().next().value);
  try{const text=await pending;if((text===null||text.length>maxChars)&&entries.get(key)===pending)entries.delete(key);return text;}
  catch(error){if(entries.get(key)===pending)entries.delete(key);throw error;}
 };
}

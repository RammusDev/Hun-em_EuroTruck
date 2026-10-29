import {createHash} from 'node:crypto';
import {makeReferencePreview,previewPolicy} from './reference-preview.mjs';

// Display derivatives are disposable process memory, never world/R2 writes.
// Call only AFTER the route's current reader and publication checks.
const displayCache=new Map(),displayPolicy={...previewPolicy,version:'book-512-q78-55-v1'};
function displayBytes(bytes){try{return makeReferencePreview(bytes,displayPolicy).bytes;}catch(error){if(error.message!=='REFERENCE_PREVIEW_TOO_LARGE')throw error;return makeReferencePreview(bytes,{...displayPolicy,quality:55}).bytes;}}
const trim=()=>{while(displayCache.size>16)displayCache.delete(displayCache.keys().next().value);};
const matches=(header,etag)=>header?.split(',').some(value=>value.trim().replace(/^W\//,'')===etag.replace(/^W\//,''));
export async function readerImageResponse(req,object,key){
 const preview=new URL(req.url).searchParams.get('view')==='book'&&key.endsWith('.png');
 const version=object.httpEtag||object.etag;
 const etag=version?'"'+createHash('sha256').update(key+'\n'+version+'\n'+(preview?displayPolicy.version:'original')).digest('hex')+'"':null;
 const headers={'Content-Type':preview?'image/jpeg':key.endsWith('.png')?'image/png':'image/jpeg','Cache-Control':'private, no-cache','Vary':'Cookie'};
 if(etag)headers.ETag=etag;
 if(etag&&matches(req.headers.get('If-None-Match'),etag)){
  await object.body?.cancel?.();return new Response(null,{status:304,headers});
 }
 if(!preview)return new Response(object.body,{headers});
 const cacheKey=etag&&key+':'+etag;
 let pending=cacheKey&&displayCache.get(cacheKey);
 if(!pending){
  pending=object.arrayBuffer().then(bytes=>displayBytes(Buffer.from(bytes)));
  if(cacheKey){displayCache.set(cacheKey,pending);trim();pending.catch(()=>{if(displayCache.get(cacheKey)===pending)displayCache.delete(cacheKey);});}
 }else await object.body?.cancel?.();
 const bytes=await pending;headers['Content-Length']=String(bytes.length);
 return new Response(new Uint8Array(bytes),{headers});
}

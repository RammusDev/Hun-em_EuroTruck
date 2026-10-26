import {referenceFallbacks} from './collection-reference-fallback.mjs';
// Public visual reference candidates, delivered as native MCP image blocks.
// Never fetch arbitrary item/source URLs or require a model-side downloader.
const maxBytes=1024*1024;
const fail=m=>{throw Error(m);};
export function referenceUrl(value,host){
 const u=new URL(value),hosts=Array.isArray(host)?host:[host];if(u.protocol!=='https:'||!hosts.includes(u.hostname)||u.username||u.password||u.port)fail('REFERENCE_HOST_REJECTED');return u.href;
}
async function bodyBytes(response){
 if(!response.ok)fail('REFERENCE_HTTP_'+response.status);
 if(Number(response.headers.get('content-length'))>maxBytes)fail('REFERENCE_TOO_LARGE');
 const reader=response.body?.getReader();if(!reader)fail('REFERENCE_EMPTY');const parts=[];let size=0;
 for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>maxBytes){await reader.cancel();fail('REFERENCE_TOO_LARGE');}parts.push(Buffer.from(r.value));}
 return Buffer.concat(parts);
}
export function referenceMime(bytes){
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 fail('REFERENCE_NOT_PNG_OR_JPEG');
}
const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,300);
export async function collectionReference(row,{fetcher=fetch}={}){
 const errors=[],photos=[];
 if(row?.kind!=='meal'||!row.name)return {photos,errors};
 const words=row.name.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{M}]{3,}/gu)||[];
 if(!words.length)return {photos,errors:['REFERENCE_NAME_TOO_SHORT']};
 const u=new URL('https://commons.wikimedia.org/w/api.php');
 u.search=new URLSearchParams({action:'query',format:'json',formatversion:'2',generator:'search',gsrnamespace:'6',gsrlimit:'5',gsrsearch:row.name+' filetype:bitmap',prop:'imageinfo',iiprop:'url|mime|size|extmetadata',iiurlwidth:'640'});
 try{
  const response=await fetcher(u,{redirect:'manual',signal:AbortSignal.timeout(6000),headers:{'User-Agent':'HunEmTravel/1.4 (public dish visual reference)'}});
  const data=JSON.parse((await bodyBytes(response)).toString('utf8'));if(data.error)fail('REFERENCE_SEARCH_FAILED');
  const candidates=(data.query?.pages||[]).filter(p=>words.every(w=>p.title?.normalize('NFKC').toLocaleLowerCase().includes(w))&&!/\b(?:logo|icon|map|drawing|illustration|recipe)\b/i.test(p.title)&&(!/vegan|vegetarian/i.test(p.title)||/vegan|vegetarian/i.test(row.name))).sort((a,b)=>(a.index||0)-(b.index||0));
  for(const page of candidates.slice(0,3)){
   if(photos.length>=2)break;
   const info=page.imageinfo?.[0];if(!info||!['image/jpeg','image/png'].includes(info.mime)||info.width<120||info.height<120)continue;
   try{
    const sourcePage=referenceUrl(info.descriptionurl,'commons.wikimedia.org'),sourceImage=referenceUrl(info.thumburl||info.url,['upload.wikimedia.org','thumb.wikimedia.org']);
    const r=await fetcher(sourceImage,{redirect:'manual',signal:AbortSignal.timeout(4000)}),bytes=await bodyBytes(r),mimeType=referenceMime(bytes);
    photos.push({bytes,mimeType,title:page.title,sourcePage,sourceImage,credit:plain(info.extmetadata?.Artist?.value),license:plain(info.extmetadata?.LicenseShortName?.value)});
   }catch(e){errors.push(e.message);}
  }
 }catch(e){errors.push(e.message);}
 if(!photos.length){for(const p of referenceFallbacks[row.name.normalize('NFKC').toLocaleLowerCase().trim()]||[]){try{const url=referenceUrl(p.sourceImage,'www.chioscoibandito.com');const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(4000)}),bytes=await bodyBytes(response);photos.push({...p,bytes,mimeType:referenceMime(bytes)});}catch(e){errors.push(e.message);}}}
 if(!photos.length&&!errors.length)errors.push('REFERENCE_NO_MATCH');
 return {photos,errors};
}
export function collectionReferenceResult(queue,reference={photos:[],errors:[]}){
 const {photos=[],errors=[]}=reference;
 const instruction='Meal photographs were prepared when the committed plan selected the dish. This drawing read uses cached bytes only: do not search or download another meal reference at drawing time. Inspect the native MCP image blocks visually and pass the visible reference to built-in imagegen with num_last_images_to_include; a local path is not required. If no cached photo is available, leave pending and report the preparation error so background preparation can retry. Saved and verified artwork deletes cached photo bytes but retains source, credit, license and hash records. Photos are appearance candidates, not proof of serving/vendor/ingredients. For soda require the exact brand and flavour official package photo. Never infer extra ingredients.';
 return {content:[{type:'text',text:JSON.stringify({...queue,referencePreparedAt:reference.preparedAt||null,referencePhotos:photos.map(({bytes,mimeType,...p})=>({...p,mimeType})),referenceErrors:errors,referenceInstruction:instruction})},...photos.map(p=>({type:'image',mimeType:p.mimeType,data:Buffer.from(p.bytes).toString('base64')}))],isError:false};
}

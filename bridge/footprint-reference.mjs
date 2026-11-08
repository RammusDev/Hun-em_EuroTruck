import {mealReferenceCache} from './meal-reference-cache.mjs';
import {bodyBytes,referenceUrl,referenceMime} from './collection-reference.mjs';
export async function footprintReference(row,{fetcher=fetch}={}){
 const requestFailures=[];
 try{
  const page=new URL(row.source);
  if(!/^[a-z-]+\.wikipedia\.org$/.test(page.hostname)||page.protocol!=='https:'||page.username||page.password||page.port||!page.pathname.startsWith('/wiki/'))throw Error('REFERENCE_ARTICLE_REQUIRED');
  const api=new URL('/w/api.php',page.origin);
  api.search=new URLSearchParams({action:'query',format:'json',formatversion:'2',prop:'pageimages',piprop:'thumbnail|name',pithumbsize:'640',titles:decodeURIComponent(page.pathname.slice(6))});
  const deadline=AbortSignal.timeout(8000),response=await fetcher(api,{redirect:'manual',signal:deadline});
  const data=JSON.parse((await bodyBytes(response,{url:api.href,stage:'wikipedia_api',failures:requestFailures})).toString('utf8')),item=data.query?.pages?.[0];
  if(!item?.thumbnail?.source)throw Error('REFERENCE_NO_MATCH');
  const sourceImage=referenceUrl(item.thumbnail.source,['upload.wikimedia.org','thumb.wikimedia.org']);
  const bytes=await bodyBytes(await fetcher(sourceImage,{redirect:'manual',signal:deadline}),{url:sourceImage,stage:'image',failures:requestFailures});
  return {photos:[{bytes,mimeType:referenceMime(bytes),title:row.name,sourcePage:page.href,sourceImage,credit:item.pageimage||'Wikipedia article photograph; see source file',license:'See source photograph license; temporary appearance reference only'}],errors:[]};
 }catch(e){return {photos:[],errors:[/^REFERENCE_[A-Z0-9_]+$/.test(e.message)?e.message:/abort|timeout/i.test(e.message)?'REFERENCE_TIMEOUT':'REFERENCE_FETCH_FAILED'],requestFailures};}
}
export const footprintReferenceCache=options=>mealReferenceCache({...options,kind:'footprint',lookup:options.lookup||footprintReference,lookupVersion:'footprint-reference-v1'});

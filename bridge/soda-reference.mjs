import catalog from './soda-reference-catalog.json' with {type:'json'};
import {bodyBytes,referenceMime,referenceUrl} from './collection-reference.mjs';
import {mealReferenceCache} from './meal-reference-cache.mjs';
export const sodaReferenceCatalog=catalog;
export const sodaPackageReference=row=>catalog.products.find(p=>p.id===row.identity&&p.status==='verified')||null;
export async function sodaReference(row,{fetcher=fetch}={}){
 const p=sodaPackageReference(row);if(!p)return {photos:[],errors:['REFERENCE_PACKAGE_NOT_REVIEWED']};
 try{
  const url=referenceUrl(p.sourceImage,catalog.allowedImageHosts);referenceUrl(p.sourcePage,catalog.allowedPageHosts);
  const r=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(6000)}),bytes=await bodyBytes(r),mimeType=referenceMime(bytes);
  return {photos:[{bytes,mimeType,title:p.title||p.id,sourcePage:p.sourcePage,sourceImage:p.sourceImage,credit:p.credit,license:p.license,packageKind:p.packageKind,sizeMl:p.sizeMl||null,packageSelector:p.packageSelector||null,referenceRole:'catalog-illustration-package',checkedOn:p.checkedOn}],errors:[]};
 }catch(e){return {photos:[],errors:[/^REFERENCE_[A-Z0-9_]+$/.test(e.message)?e.message:/timeout|abort/i.test(e.message)?'REFERENCE_TIMEOUT':'REFERENCE_FETCH_FAILED']};}
}
export const sodaReferenceCache=options=>mealReferenceCache({...options,kind:'soda',lookup:options.lookup||sodaReference,lookupVersion:catalog.version});

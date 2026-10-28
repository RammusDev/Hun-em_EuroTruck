import catalog from './soda-reference-catalog.json' with {type:'json'};
import {bodyBytes,referenceMime,referenceUrl} from './collection-reference.mjs';
import {mealReferenceCache} from './meal-reference-cache.mjs';
import {createHash} from 'node:crypto';
export const sodaReferenceCatalog=catalog;
export const sodaPackageReference=row=>catalog.products.find(p=>p.id===row.identity&&p.status==='verified')||null;
export const sodaPhotoSources=p=>p?[p,...(p.alternatives||[])].slice(0,3):[];
export function reviewedSodaPhoto(row,bytes){
 if(bytes.length>1024*1024)throw Error('REFERENCE_TOO_LARGE');
 const sha256=createHash('sha256').update(bytes).digest('hex'),p=sodaPackageReference(row),source=sodaPhotoSources(p).find(s=>s.sha256===sha256);
 if(!source)throw Error('REFERENCE_REVIEWED_HASH_REQUIRED');
 referenceUrl(source.sourceImage,catalog.allowedImageHosts);referenceUrl(source.sourcePage,catalog.allowedPageHosts);
 return {bytes,mimeType:referenceMime(bytes),title:source.title||p.title||p.id,sourcePage:source.sourcePage,sourceImage:source.sourceImage,credit:source.credit||p.credit,license:source.license||p.license,packageKind:p.packageKind,sizeMl:p.sizeMl||null,packageSelector:source.packageSelector||p.packageSelector||null,referenceRole:'catalog-illustration-package',checkedOn:source.checkedOn||p.checkedOn,preparationMethod:'owner-reviewed-original'};
}
export async function sodaReference(row,{fetcher=fetch}={}){
 const p=sodaPackageReference(row);if(!p)return {photos:[],errors:['REFERENCE_PACKAGE_NOT_REVIEWED']};
 const errors=[],deadline=AbortSignal.timeout(8000);
 for(const source of sodaPhotoSources(p))try{
  const url=referenceUrl(source.sourceImage,catalog.allowedImageHosts);referenceUrl(source.sourcePage,catalog.allowedPageHosts);
  const r=await fetcher(url,{redirect:'manual',headers:{'User-Agent':'HunEmTravel/1.4 (official soda package visual reference)','Accept':'image/png,image/jpeg,image/webp'},signal:AbortSignal.any([deadline,AbortSignal.timeout(6000)])}),bytes=await bodyBytes(r),mimeType=referenceMime(bytes);
  if(source.sha256&&createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('REFERENCE_SOURCE_CHANGED');
  return {photos:[{bytes,mimeType,title:source.title||p.title||p.id,sourcePage:source.sourcePage,sourceImage:source.sourceImage,credit:source.credit||p.credit,license:source.license||p.license,packageKind:p.packageKind,sizeMl:p.sizeMl||null,packageSelector:source.packageSelector||p.packageSelector||null,referenceRole:'catalog-illustration-package',checkedOn:source.checkedOn||p.checkedOn}],errors};
 }catch(e){errors.push(/^REFERENCE_[A-Z0-9_]+$/.test(e.message)?e.message:/timeout|abort/i.test(e.message)?'REFERENCE_TIMEOUT':'REFERENCE_FETCH_FAILED');if(deadline.aborted)break;}
 return {photos:[],errors:[...new Set(errors)]};
}
export const sodaReferenceCache=options=>mealReferenceCache({...options,kind:'soda',lookup:options.lookup||sodaReference,lookupVersion:catalog.version});

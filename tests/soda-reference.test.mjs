import test from 'node:test';import assert from 'node:assert/strict';
import {sodaReference,sodaPackageReference,sodaReferenceCatalog,sodaReferenceCache} from '../bridge/soda-reference.mjs';
const jpeg=Buffer.from([255,216,255,224,0,1]),row={kind:'soda',identity:'sanpellegrino-limonata',name:'Sanpellegrino Limonata Naturali'};
test('all 37 catalog products have reviewed packages; historic source and unknown capacities remain explicit',()=>{
 const products=sodaReferenceCatalog.products;assert.equal(products.length,37);assert.equal(new Set(products.map(p=>p.id)).size,37);
 for(const p of products){assert.equal(p.status,'verified');assert.equal(new URL(p.sourceImage).protocol,'https:');assert.ok(p.packageKind);assert.ok(p.license);assert.ok(p.checkedOn);}
 assert.ok(products.some(p=>p.sizeMl===null));assert.equal(sodaPackageReference(row).sizeMl,330);assert.equal(products.find(p=>p.id==='gubernija-dark-rye-kvass').sourceYear,2020);
});
test('soda lookup downloads only explicit official image, carries package selection, rejects unrelated products and oversized responses',async()=>{
 let calls=0;const r=await sodaReference(row,{fetcher:async(url,init)=>{calls++;assert.equal(init.redirect,'manual');assert.equal(String(url),sodaPackageReference(row).sourceImage);return new Response(jpeg);}});
 assert.equal(calls,1);assert.equal(r.photos[0].packageKind,'can');assert.equal(r.photos[0].sizeMl,330);assert.equal(r.photos[0].referenceRole,'catalog-illustration-package');
 assert.deepEqual((await sodaReference({...row,identity:'not-in-catalog'},{fetcher:async()=>{throw Error('must not fetch');}})).errors,['REFERENCE_PACKAGE_NOT_REVIEWED']);
 assert.deepEqual((await sodaReference(row,{fetcher:async()=>new Response(jpeg,{headers:{'content-length':String(1024*1024+1)}})})).errors,['REFERENCE_TOO_LARGE']);
 assert.deepEqual((await sodaReference(row,{fetcher:async()=>new Response(null,{status:403})})).errors,['REFERENCE_HTTP_403']);
});
test('cached soda photo reads never fetch and verified save removes only that soda cache',async()=>{
 const objects=new Map(),bucket={get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k)),arrayBuffer:async()=>Buffer.from(objects.get(k))}:null,put:async(k,v)=>objects.set(k,v),delete:async k=>objects.delete(k),list:async({prefix})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})};
 const id='b'.repeat(32);let calls=0;const cache=sodaReferenceCache({bucket,now:()=>1000,lookup:async()=>{calls++;return {photos:[{bytes:jpeg,mimeType:'image/jpeg',sourcePage:'https://example.org',license:'official'}],errors:[]};}});
 await cache.prepare({...row,id});await cache.read(id);await cache.read(id);assert.equal(calls,1);assert.ok(objects.has('reference-photos/soda-v1/'+id+'.json'));assert.ok(!objects.has('reference-photos/meal-v2/'+id+'.json'));
 const {createHash}=await import('node:crypto');await bucket.put('art.png',jpeg);await bucket.put('thumb.jpg',jpeg);await cache.finish(id,{src:'/art.png',thumbnail:'/thumb.jpg',sha256:createHash('sha256').update(jpeg).digest('hex')});assert.ok(!objects.has('reference-photos/soda-v1/'+id+'.json'));assert.ok(objects.has('reference-audit/soda/'+id+'.json'));
});

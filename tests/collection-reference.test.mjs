import test from 'node:test';import assert from 'node:assert/strict';
import {collectionReference,collectionReferenceResult,referenceUrl} from '../bridge/collection-reference.mjs';
import {pilotRpc} from '../bridge/mcp-pilot.mjs';
const jpeg=Buffer.from([255,216,255,224,0,1]),row={kind:'meal',name:'lampredotto'};
const page=(title='File:Lampredotto.jpg',url='https://upload.wikimedia.org/test.jpg')=>({title,index:1,imageinfo:[{mime:'image/jpeg',width:800,height:600,thumburl:url,descriptionurl:'https://commons.wikimedia.org/wiki/'+title,extmetadata:{Artist:{value:'<a>Photographer</a>'},LicenseShortName:{value:'CC BY-SA'}}}]});
test('native references preserve provenance and image blocks without requiring a local file',async()=>{
 let calls=0;const r=await collectionReference(row,{fetcher:async(url,init)=>{calls++;assert.equal(init.redirect,'error');return String(url).includes('/w/api.php')?Response.json({query:{pages:[page()]}}):new Response(jpeg);}});
 assert.equal(calls,2);assert.equal(r.photos.length,1);assert.equal(r.photos[0].credit,'Photographer');
 const result=collectionReferenceResult({items:[row]},r);assert.equal(result.content[1].type,'image');assert.equal(result.content[1].data,jpeg.toString('base64'));
 const metadata=JSON.parse(result.content[0].text);assert.equal(metadata.referencePhotos[0].sourcePage,'https://commons.wikimedia.org/wiki/File:Lampredotto.jpg');assert.equal(metadata.referencePhotos[0].bytes,undefined);assert.match(metadata.referenceInstruction,/num_last_images_to_include/);
 const rpc=await pilotRpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'hunem_collection_queue'}},{identity:'owner',handlers:{hunem_collection_queue:async()=>result}});assert.equal(rpc.result.content[1].type,'image');
});
test('an image failure falls back to another matching Commons photo, rejecting unrelated results',async()=>{
 const calls=[];const r=await collectionReference(row,{fetcher:async url=>{calls.push(String(url));if(String(url).includes('/w/api.php'))return Response.json({query:{pages:[page('File:Hamburger.jpg'),page('File:Lampredotto one.jpg','https://upload.wikimedia.org/missing.jpg'),page('File:Lampredotto two.jpg')]}});return String(url).includes('missing')?new Response(null,{status:404}):new Response(jpeg);}});
 assert.equal(r.photos.length,1);assert.ok(r.errors.includes('REFERENCE_HTTP_404'));assert.equal(calls.length,3);
});
test('arbitrary hosts, credentials, redirects and non-image responses cannot become reference images',async()=>{
 assert.equal(referenceUrl('https://thumb.wikimedia.org/x',['upload.wikimedia.org','thumb.wikimedia.org']),'https://thumb.wikimedia.org/x');
 for(const url of ['http://upload.wikimedia.org/x','https://upload.wikimedia.org.evil.test/x','https://a:b@upload.wikimedia.org/x','https://upload.wikimedia.org:444/x'])assert.throws(()=>referenceUrl(url,'upload.wikimedia.org'));
 const r=await collectionReference(row,{fetcher:async url=>String(url).includes('/w/api.php')?Response.json({query:{pages:[page()]}}):new Response('<html>not a photo</html>')});assert.equal(r.photos.length,0);assert.ok(r.errors.includes('REFERENCE_NOT_PNG_OR_JPEG'));
});
test('no results or provider failure leave the queue usable and never invent image evidence',async()=>{
 for(const fetcher of [async()=>Response.json({query:{pages:[]}}),async()=>{throw Error('offline');}]){const ref=await collectionReference(row,{fetcher});assert.equal(ref.photos.length,0);const result=collectionReferenceResult({pending:1,items:[row]},ref);assert.equal(result.content.length,1);assert.equal(JSON.parse(result.content[0].text).pending,1);}
 assert.deepEqual((await collectionReference({kind:'soda',name:'brand'})).photos,[]);
});

test('oversized image responses are refused instead of returned as visual evidence',async()=>{
 const r=await collectionReference(row,{fetcher:async url=>String(url).includes('/w/api.php')?Response.json({query:{pages:[page()]}}):new Response(jpeg,{headers:{'content-length':String(768*1024+1)}})});
 assert.equal(r.photos.length,0);assert.ok(r.errors.includes('REFERENCE_TOO_LARGE'));
});

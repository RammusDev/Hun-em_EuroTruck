import test from 'node:test';
import assert from 'node:assert/strict';
import {repairSketchSubject,reviewedReferenceSources,reviewedSketchReference,recoveryMealId,recoveryMealName,recoveryWorld} from '../bridge/sketch-repairs.mjs';
const meal={id:recoveryMealId,name:'Frankfurter Kartoffelhaus',worldId:recoveryWorld,occurrences:[{key:'meal:meal:2026-11-07:dinner'}]};
test('owner-confirmed dish correction is scoped to one occurrence and world, without rewriting records',()=>{
 const before=JSON.stringify(meal),fixed=repairSketchSubject(meal,'meal',recoveryWorld);
 assert.equal(fixed.name,recoveryMealName);assert.equal(fixed.id,meal.id);assert.equal(JSON.stringify(meal),before);assert.match(fixed.summary,/Component photos/);
 for(const row of [{...meal,id:'a'.repeat(32)},{...meal,occurrences:[{key:'different'}]},{...meal,occurrences:[...meal.occurrences,{key:'another'}]}])assert.equal(repairSketchSubject(row,'meal',recoveryWorld),row);
 assert.equal(repairSketchSubject(meal,'meal','other-world'),meal);assert.equal(repairSketchSubject(meal,'soda',recoveryWorld),meal);
 assert.equal(reviewedReferenceSources('meal',meal),null);assert.equal(reviewedReferenceSources('meal',fixed).length,2);
});
test('server retrieves reviewed photos under original size, redirect and host bounds; partial components never permit drawing',async()=>{
 const sources=reviewedReferenceSources('meal',repairSketchSubject(meal,'meal',recoveryWorld)),jpeg=Buffer.from([255,216,255,224,0,1]);let calls=0;
 const all=await reviewedSketchReference(sources,{fetcher:async(url,o)=>{calls++;assert.equal(o.redirect,'manual');assert.ok(o.signal);return new Response(jpeg);}});
 assert.equal(calls,2);assert.equal(all.photos.length,2);assert.equal(all.photos[0].referenceRole,'cooked-salmon-component-only');
 calls=0;const partial=await reviewedSketchReference(sources,{fetcher:async()=>++calls===1?new Response(jpeg):new Response(null,{status:403})});assert.deepEqual(partial.photos,[]);assert.deepEqual(partial.errors,['REFERENCE_HTTP_403']);
 const rejected=await reviewedSketchReference([{...sources[0],sourceImage:'https://private.example/image'}],{fetcher:()=>{throw Error('must not fetch');}});assert.deepEqual(rejected.errors,['REFERENCE_HOST_REJECTED']);
 const church=reviewedReferenceSources('footprint',{id:'fd11c7e1b0829a05f012c61885853af7',worldId:recoveryWorld,name:'Friedenskirche'});assert.equal(church[0].referenceRole,'exact-landmark');
 const parkRow={id:'ded7b75f1bf0ef7c3df5e6006b92b808',worldId:recoveryWorld,name:'Lennépark'},park=reviewedReferenceSources('footprint',parkRow);
 assert.equal(reviewedReferenceSources('footprint',{...parkRow,worldId:'other'}),null);
 assert.equal(reviewedReferenceSources('footprint',{...parkRow,id:'a'.repeat(32)}),null);
 const parkFailure=await reviewedSketchReference(park,{fetcher:async()=>new Response(null,{status:403})});
 assert.deepEqual(parkFailure.requestFailures,[{status:403,stage:'image',url:park[0].sourceImage}]);
});

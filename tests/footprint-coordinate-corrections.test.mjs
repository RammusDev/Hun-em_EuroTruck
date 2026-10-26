import test from 'node:test';import assert from 'node:assert/strict';
import {correctFootprintCoordinates,footprintCoordinateCorrections} from '../bridge/footprint-coordinate-corrections.mjs';
import {footprintInventory,mapFootprints} from '../bridge/footprints.mjs';
const c=footprintCoordinateCorrections[0],row=()=>({id:c.id,topicId:c.topicId,name:c.name,p:[...c.recordedP],source:c.articleSource,visits:[1793035740000],image:{sha256:'unchanged'}});
test('manual correction changes only the verified point and retains original coordinates, times, image and provenance',()=>{
 const input=[row(),{...row(),id:'other'}],before=structuredClone(input),out=correctFootprintCoordinates(input);
 assert.deepEqual(input,before);assert.deepEqual(out[0].p,[15.108917,40.399667]);assert.deepEqual(out[0].recordedP,before[0].p);assert.deepEqual(out[0].visits,before[0].visits);assert.deepEqual(out[0].image,before[0].image);assert.equal(out[0].coordinateCorrection.kind,'owner-verified');assert.equal(out[1],input[1]);assert.deepEqual(correctFootprintCoordinates(out),out);
});
test('unexpected identity, source or previously changed coordinates cannot be silently overwritten',()=>{
 for(const change of [{name:'Another church'},{source:'https://example.org'},{topicId:'other'},{p:[1,2]},{p:null}]){const input={...row(),...change};assert.equal(correctFootprintCoordinates([input])[0],input);}
});
test('real saved visit projection and map use corrected location without mutating archived or live history',()=>{
 const event={type:'visit',time:1793035740000,location:'it-potenza',place:{topicId:c.topicId,name:c.name,p:[...c.recordedP],source:c.articleSource}},payload={world:{publicationWorldId:'c9181921-e285-4ada-bf6f-c763c678964e',events:[event],publicationJobs:[{input:{events:[event]}}],visits:{landmarks:{}}}},before=structuredClone(payload);
 const rows=footprintInventory(payload,1793035800000);assert.equal(rows.length,1);assert.equal(rows[0].id,c.id);assert.deepEqual(rows[0].p,[15.108917,40.399667]);assert.deepEqual(payload,before);
 assert.equal(mapFootprints(rows,{west:15.10,east:15.12,south:40.39,north:40.41,zoom:18}).length,1);assert.equal(mapFootprints(rows,{west:15.44,east:15.46,south:40.53,north:40.55,zoom:18}).length,0);
});

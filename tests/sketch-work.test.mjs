import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {prepareSketchWork,sketchPacket} from '../bridge/sketch-work.mjs';
test('three sketch kinds: deterministic delivered-ID recovery, compact native handoff, ambiguity rejection and no claim for existing art',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'sketch-work'},host:'127.0.0.1',port:0});
 try{
  const db=await mf.getD1Database('DB');await db.prepare('CREATE TABLE hunem_runtime(id TEXT PRIMARY KEY,value TEXT)').run();
  for(const kind of ['footprint','meal','soda']){
   const id='a'.repeat(32),other='b'.repeat(32),prefix=kind==='footprint'?'footprint-event:':'collection-event:'+kind+':';
   const row={id,name:'Recorded subject',kind,selectionRecorded:true,sketchEligible:true,illustrationPackage:{packageKind:'can'},occurrences:[{location:'city'}],events:['private history']};
   let claims=0,reads=0;const deps={db,kind,rows:[row],claim:async resolved=>{claims++;assert.equal(resolved,id);return {action:'generate',lease:'test-lease',expiresAt:123,item:row};},reference:async()=>{reads++;return {photos:[{bytes:Buffer.from('native-photo'),mimeType:'image/png',sourcePage:'https://example.test'}],errors:[]};}};
   assert.equal((await prepareSketchWork(deps)).action,'identity_required');assert.equal(claims,0);
   const delivery=kind==='footprint'?{footprintId:id}:{collectionId:id};
   await db.prepare('INSERT INTO hunem_runtime VALUES(?,?)').bind(prefix+'one',JSON.stringify({status:'sent',...delivery})).run();
   const result=await prepareSketchWork(deps),packet=JSON.parse(result.content[0].text);
   assert.equal(claims,1);assert.equal(reads,1);assert.equal(packet.action,'generate');assert.equal(packet.id,id);assert.equal(packet.lease,'test-lease');assert.equal(result.content[1].data,Buffer.from('native-photo').toString('base64'));assert.ok(!result.content[0].text.includes('private history'));assert.ok(!('item' in packet));
   assert.equal(packet.work.save.arguments.id,id);assert.equal(packet.work.save.tool,kind==='footprint'?'hunem_receive_footprint':'hunem_receive_collection');assert.equal(packet.work.release,'server-only-after-activity-completion');
   if(kind==='soda'){assert.equal(packet.work.subject.illustrationPackage.packageKind,'can');assert.equal(packet.work.referencePolicy.actualPurchasePackageRequired,false);}
   await db.prepare('INSERT INTO hunem_runtime VALUES(?,?)').bind(prefix+'two',JSON.stringify({status:'sent',...(kind==='footprint'?{footprintId:other}:{collectionId:other})})).run();
   assert.equal((await prepareSketchWork({...deps,rows:[row,{...row,id:other}]})).action,'identity_required');assert.equal(claims,1);
   assert.equal((await prepareSketchWork({...deps,id,rows:[{...row,image:{sha256:'saved'}}]})).action,'already-drawn');assert.equal(claims,1);
   assert.equal((await prepareSketchWork({...deps,id,claim:async()=>({action:'busy'})})).action,'busy');assert.equal(reads,1);
   const empty=await prepareSketchWork({...deps,id,reference:async()=>{throw Error('cache outage');}});assert.equal(JSON.parse(empty.content[0].text).action,'generate');assert.equal(empty.content.length,1);
   await assert.rejects(()=>prepareSketchWork({...deps,id:other}),/RECORDED_SKETCH_REQUIRED/);
  }
  await assert.rejects(()=>prepareSketchWork({kind:'other'}),/INVALID_SKETCH/);
  await assert.rejects(()=>prepareSketchWork({kind:'meal',id:'invalid'}),/INVALID_SKETCH/);
 }finally{await mf.dispose();}
});
test('visual constraints stay kind-specific and no input mutation',()=>{
 const row={id:'a'.repeat(32),name:'Landmark',image:null};const before=JSON.stringify(row);
 assert.match(sketchPacket('footprint',row).drawingPrompt,/present-day remains/);
 assert.match(sketchPacket('meal',row).drawingPrompt,/ingredients/);
 assert.doesNotMatch(sketchPacket('meal',row).drawingPrompt,/tower/);
 assert.equal(JSON.stringify(row),before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
import png from 'pngjs';
import {selectedSketches,completedSketches,publishCompletedSketches,registerSketchSelections,sketchSelectionState} from '../bridge/sketch-lifecycle.mjs';
import {collectionEventService} from '../bridge/collection-events.mjs';
import {footprintEventService,visitEvent} from '../bridge/footprint-events.mjs';

async function loadApi(name){
 const url=new URL('../lib/'+name+'.ts',import.meta.url);
 let code=await fs.readFile(url,'utf8');
 code=code.replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__sketchLifecycle;').replace("import {committed} from './runtime';",'const committed=async()=>globalThis.__sketchLifecycle.p;');
 code=code.replace(/from '(\.\.?\/[^']+\.mjs)'/g,(_,rel)=>'from '+JSON.stringify(new URL(rel,url).href));
 return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
}
const dish={name:'Pannfisch',localDish:true,cityId:'a',source:'https://example.org/dish'};
const place={topicId:'landmark',name:'Real landmark',p:[9,54],source:'https://example.org/landmark'};
const fixtures=at=>[
 {type:'expense',category:'meal',id:'meal-one',time:at+60000,food:dish},
 {type:'expense',category:'soda',id:'bottle-one',time:at+60000,soda:{id:'orange',name:'Orange soda'}},
 {type:'visit',time:at+120000,place}
];
const payload=at=>({world:{publicationWorldId:'lifecycle-test',now:at,realAt:at,events:[],localTopicCache:{candidates:[{id:'never-draw-this'}]}},eventPlan:{createdAt:at,steps:[{patch:[[['events'],1,fixtures(at)]]}]}});

test('only saved selections are prepared; drinking matches the exact purchase across days; cancelled forecasts are not facts',()=>{
 const at=Date.now()-3*86400000,p=payload(at),before=JSON.stringify(p);
 for(const kind of ['meal','soda','footprint']){assert.equal(selectedSketches(p,kind).length,1);assert.equal(completedSketches(p,kind).length,0);}
 assert.equal(JSON.stringify(p),before);
 p.eventPlan.steps=[];for(const kind of ['meal','soda','footprint'])assert.equal(selectedSketches(p,kind).length,0);
 p.world.events=fixtures(at).slice(0,2);p.world.now=at+2*86400000;
 p.world.events.push({type:'soda_finished',time:at+86400000,purchaseId:'another-bottle',soda:{id:'orange'}});
 assert.equal(completedSketches(p,'soda').length,0);
 p.world.events.push({type:'soda_finished',time:at+86400000,purchaseId:'bottle-one',soda:{id:'orange'}});
 assert.equal(completedSketches(p,'soda')[0].count,1);
});

test('real D1/R2: selection notifies once, art stages privately, completion alone releases, direct URLs and GETs cannot bypass it',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'sketch-lifecycle'},r2Buckets:{BUCKET:'sketch-lifecycle'},host:'127.0.0.1',port:0});
 try{
  const DB=await mf.getD1Database('DB'),BUCKET=await mf.getR2Bucket('BUCKET');
  await DB.prepare('CREATE TABLE hunem_runtime(id TEXT PRIMARY KEY,value TEXT,revision INTEGER,updated_at INTEGER,lease TEXT,lease_until INTEGER)').run();
  const at=Date.now()-3600000,p=payload(at),sent=[];
  globalThis.__sketchLifecycle={DB,BUCKET,p};
  const [collections,footprints]=await Promise.all([loadApi('collections'),loadApi('footprints')]);
  const fetcher=async(_url,o)=>{const body=JSON.parse(o.body);if(body.type==='verification')return Response.json({challenge:body.challenge});sent.push(body);return new Response(null,{status:202});};
  const services=[...['meal','soda'].map(kind=>collectionEventService({prepareReference:async()=>({photos:[{bytes:Buffer.from("photo"),mimeType:"image/png",sourcePage:"https://example.test"}],errors:[]}),db:DB,bucket:BUCKET,kind,now:()=>at,fetcher})),footprintEventService({prepareReference:async()=>({photos:[{bytes:Buffer.from("photo"),mimeType:"image/png",sourcePage:"https://example.test"}],errors:[]}),db:DB,bucket:BUCKET,now:()=>at,fetcher})];
  for(const [i,name]of ['hunem.meal_completed','hunem.soda_purchased',visitEvent].entries())await services[i].rpc('events/subscribe',{name,arguments:{},delivery:{mode:'webhook',url:'https://chatgpt.com/mcp-events/lifecycle-'+i,secret:'whsec_'+Buffer.alloc(32,8).toString('base64')},ttlMs:86400000},'owner',p.world.publicationWorldId);
  await Promise.all(services.map(s=>s.process(p)));assert.equal(sent.length,3,'all draw triggers fire before any real completion');
  const visitNotice=sent.find(e=>e.name===visitEvent);assert.equal(visitNotice.timestamp,new Date(at).toISOString());assert.ok(visitNotice.data.visitedAt>at,'legacy field carries the planned visit time; callback fields stay compatible');assert.equal(visitNotice.data.selectedAt,undefined);
  const queues=[await collections.collectionQueue('meal'),await collections.collectionQueue('soda'),await footprints.footprintQueue()];
  for(const q of queues)assert.equal(q.items.length,1);
  const claims=['meal','soda','footprint'].map(kind=>{const packet=sent.find(e=>e.data.sketch.kind===kind).data.sketch;return {id:packet.id,lease:packet.work.save.arguments.lease};});
  assert.equal((await collections.claimCollection('meal',claims[0].id)).action,'busy','legacy claim cannot steal prepared work');
  const rgba=Buffer.alloc(128*128*4,255);rgba[3]=0;const bytes=png.PNG.sync.write({width:128,height:128,data:rgba});
  const review={tool:'image_gen.imagegen',actuallyCalled:true,subjectRecognizable:true,landmarkRecognizable:true,originalGeneratedPath:'synthetic-test-fixture-only'};
  for(const [i,kind] of ['meal','soda','footprint'].entries())assert.equal(await BUCKET.get(`reference-photos/${kind==='meal'?'meal-v2':kind+'-v1'}/${claims[i].id}.json`),null,'transport fixture does not populate R2; stored-reference tests verify the production gate');
  const saved=[await collections.saveCollection('meal',claims[0].id,claims[0].lease,bytes,review),await collections.saveCollection('soda',claims[1].id,claims[1].lease,bytes,review),await footprints.saveFootprint(claims[2].id,bytes,review,claims[2].lease)];
  for(const image of saved)assert.equal(image.publishedAt,null);
  assert.equal((await services[0].status(p)).selections[0].state,'private_ready');
  assert.equal((await collections.collectionRead(new URL('https://test/api/collections?mode=summary'))).soda.total,0);
  assert.equal((await footprints.footprintRead(new URL('https://test/api/footprints'))).total,0);
  for(const [i,image]of saved.entries())for(const key of [image.src,image.thumbnail])assert.equal(await(i===2?footprints.footprintObject(key.slice(1)):collections.collectionObject(key.slice(1))),null);
  const dbBefore=JSON.stringify((await DB.prepare('SELECT * FROM hunem_runtime ORDER BY id').all()).results),worldBefore=JSON.stringify(p);
  await collections.collectionQueue('meal');await collections.collectionRead(new URL('https://test/api/collections?kind=soda'));await footprints.footprintQueue();
  assert.equal(JSON.stringify((await DB.prepare('SELECT * FROM hunem_runtime ORDER BY id').all()).results),dbBefore);assert.equal(JSON.stringify(p),worldBefore);
  await Promise.all(services.map(s=>s.process(p)));assert.equal(sent.length,3,'a prepared image suppresses repeated generation');
  const events=fixtures(at);p.world.events=[...events,{type:'meal_finished',mealId:'meal-one',time:at+120000,food:dish},{type:'soda_finished',purchaseId:'bottle-one',time:at+120000,soda:{id:'orange'}}];p.world.now=at+120000;p.eventPlan.steps=[];
  assert.equal(await collections.collectionObject(saved[0].src.slice(1)),null,'GET cannot publish even after the fact completes');
  const thumbKey=saved[2].thumbnail.slice(1),originalThumb=Buffer.from(await(await BUCKET.get(thumbKey)).arrayBuffer());await BUCKET.delete(thumbKey);
  await assert.rejects(()=>publishCompletedSketches({db:DB,bucket:BUCKET,p,onlyKind:'footprint'}),/READBACK_REQUIRED/);assert.equal(await footprints.footprintObject(saved[2].src.slice(1)),null);
  await BUCKET.put(thumbKey,originalThumb);
  const releases=await Promise.all([publishCompletedSketches({db:DB,bucket:BUCKET,p}),publishCompletedSketches({db:DB,bucket:BUCKET,p})]);assert.equal(releases.reduce((n,r)=>n+r.published,0),3);
  for(const [i,image]of saved.entries())for(const key of [image.src,image.thumbnail])assert.ok(await(i===2?footprints.footprintObject(key.slice(1)):collections.collectionObject(key.slice(1))));
  await Promise.all(services.map(s=>s.process(p)));assert.equal(sent.length,3,'completion never sends a second drawing trigger');assert.equal((await publishCompletedSketches({db:DB,bucket:BUCKET,p})).published,0);
  // A cancelled selection is never made public and cannot be claimed.
  const cancelled=payload(at);cancelled.world.publicationWorldId='cancelled';globalThis.__sketchLifecycle.p=cancelled;await registerSketchSelections(DB,cancelled);
  const id=(await collections.collectionQueue('meal')).items[0].id;cancelled.eventPlan.steps=[];
  await assert.rejects(()=>collections.claimCollection('meal',id),/SPECIALTY_OR_PURCHASE/);assert.equal((await collections.collectionQueue('meal')).items.length,0);
  assert.equal((await sketchSelectionState(DB,cancelled,'meal'))[0].state,'cancelled');
  // Late drawing completion follows the same publication gate, without a second trigger.
  const late=payload(at);late.world.publicationWorldId='late';globalThis.__sketchLifecycle.p=late;
  await registerSketchSelections(DB,late);const lateId=(await collections.collectionQueue('meal')).items[0].id,lateClaim=await collections.claimCollection('meal',lateId);
  late.world.events=[...fixtures(at),{type:'meal_finished',mealId:'meal-one',time:at+120000,food:dish}];late.world.now=at+120000;late.eventPlan.steps=[];
  const lateImage=await collections.saveCollection('meal',lateId,lateClaim.lease,bytes,review);assert.ok(Number.isFinite(lateImage.publishedAt));assert.ok(await collections.collectionObject(lateImage.src.slice(1)));
  const retry=payload(at);retry.world.publicationWorldId='retry';globalThis.__sketchLifecycle.p=retry;
  const retryId=(await collections.collectionQueue('meal')).items[0].id,retryClaim=await collections.claimCollection('meal',retryId);
  const retryImage=await collections.saveCollection('meal',retryId,retryClaim.lease,bytes,review);assert.equal(retryImage.publishedAt,null);
  retry.world.events=[...fixtures(at),{type:'meal_finished',mealId:'meal-one',time:at+120000,food:dish}];retry.world.now=at+120000;retry.eventPlan.steps=[];
  const reused=await collections.saveCollection('meal',retryId,retryClaim.lease,bytes,review);assert.equal(reused.reused,true);assert.equal(reused.sha256,retryImage.sha256);assert.ok(Number.isFinite(reused.publishedAt));
 }finally{delete globalThis.__sketchLifecycle;await mf.dispose();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {cacheSketchReference} from '../bridge/sketch-reference.mjs';
import {mealReferenceCache} from '../bridge/meal-reference-cache.mjs';
import {selectedSketches} from '../bridge/sketch-lifecycle.mjs';
import {readPlatformReference} from '../bridge/mcp-file.mjs';
import {footprintReference,footprintReferenceCache} from '../bridge/footprint-reference.mjs';
import {referenceUserAgent} from '../bridge/collection-reference.mjs';
import {collectionEventService} from '../bridge/collection-events.mjs';
const jpeg=Buffer.from([255,216,255,224,0,1]);
test('native reference handoff binds to exact selection and active lease, preserves photos through retries, never mutates world or publishes art',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'reference-handoff'},r2Buckets:{BUCKET:'reference-handoff'},host:'127.0.0.1',port:0});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
  await db.prepare('CREATE TABLE hunem_runtime(id TEXT PRIMARY KEY,value TEXT,revision INTEGER,updated_at INTEGER,lease TEXT,lease_until INTEGER)').run();
  let now=1000;
  for(const kind of ['meal','footprint']){
   const event=kind==='meal'?{type:'expense',category:'meal',id:'meal',time:2000,food:{name:'Risotto',localDish:true,cityId:'it-palermo',source:'https://en.wikivoyage.org/wiki/Italy'}}:{type:'visit',time:2000,place:{topicId:'wikipedia:it:1',name:'Church',source:'https://it.wikipedia.org/wiki/Church'}};
   const p={world:{publicationWorldId:'w',now:1000,events:[]},eventPlan:{createdAt:1000,steps:[{patch:[[['events'],1,[event]]]}]}},before=JSON.stringify(p);
   const row=selectedSketches(p,kind)[0],key=kind==='meal'?'collection-claim:meal:'+row.id:'footprint-claim:'+row.id;
   if(kind==='meal'){
    let notifications=0;
    const service=collectionEventService({prepareReference:async()=>({photos:[],errors:["REFERENCE_HTTP_403"]}),db,bucket,kind,now:()=>now,ready:async()=>false,fetcher:async(url,options)=>{const body=JSON.parse(options.body);if(body.type==='verification')return Response.json({challenge:body.challenge});notifications++;return new Response(null,{status:200});}});
    await service.rpc('events/subscribe',{name:'hunem.meal_completed',arguments:{},delivery:{mode:'webhook',url:'https://chatgpt.com/mcp-events/reference-test',secret:'whsec_'+Buffer.alloc(32,8).toString('base64')},ttlMs:86400000},'owner','w');
    await service.process(p);assert.equal(notifications,0,'HTTP403 must not wake an AI task without a stored reference');
   }
   const args={db,bucket,p,kind,id:row.id,lease:'active',bytes:jpeg,source:{sourcePage:'https://commons.wikimedia.org/wiki/File:Photo.jpg',sourceImage:'https://upload.wikimedia.org/Photo.jpg',credit:'Photographer',license:'CC0',visuallyMatched:true},now};
   await assert.rejects(()=>cacheSketchReference(args),/ACTIVE_REFERENCE_CLAIM_REQUIRED/);
   await db.prepare('INSERT OR REPLACE INTO hunem_runtime(id,value,revision,updated_at,lease,lease_until) VALUES(?,?,0,?,?,?)').bind(key,'{}',now,'active',now+1200000).run();
   await assert.rejects(()=>cacheSketchReference({...args,source:{...args.source,visuallyMatched:false}}),/VISUAL_REVIEW_REQUIRED/);
   await assert.rejects(()=>cacheSketchReference({...args,id:'f'.repeat(32)}),/SELECTED_SUBJECT_REQUIRED/);
   assert.equal((await cacheSketchReference(args)).action,'reference-ready');
   const cache=mealReferenceCache({bucket,kind,now:()=>now,lookup:async()=>{throw Error('remote must never be re-fetched');}});
   now+=8*86400000;await cache.sweep(new Map(),new Set([row.id]));await cache.prepare(row);
   assert.deepEqual((await cache.read(row.id)).photos[0].bytes,jpeg);
   assert.equal(JSON.stringify(p),before);
   assert.equal(await db.prepare('SELECT value FROM hunem_runtime WHERE id=?').bind(kind==='meal'?'collection:meal:'+row.id:'footprint:'+row.id).first(),null);
   now=1000;
  }
 }finally{await mf.dispose();}
});
test('native reference delivery accepts bounded image bytes and refuses arbitrary download hosts and oversized streams',async()=>{
 const file={file_id:'x',download_url:'https://files.oaiusercontent.com/reference',mime_type:'image/jpeg'};
 assert.deepEqual((await readPlatformReference(file,async()=>new Response(jpeg))).bytes,jpeg);
 await assert.rejects(()=>readPlatformReference({...file,download_url:'https://example.org/private'},async()=>new Response(jpeg)),/UNSUPPORTED_FILE/);
 await assert.rejects(()=>readPlatformReference(file,async()=>new Response(Buffer.alloc(1024*1024+1))),/REFERENCE_TOO_LARGE/);
});
test('landmark reference preparation resolves exact article and reports HTTP403 without fetching unrelated source URLs',async()=>{
 let calls=0;
 const r=await footprintReference({name:'Church',source:'https://it.wikipedia.org/wiki/Exact_Church'},{fetcher:async url=>{calls++;if(calls===1){assert.equal(new URL(url).searchParams.get('titles'),'Exact_Church');return Response.json({query:{pages:[{pageimage:'Church.jpg',thumbnail:{source:'https://upload.wikimedia.org/church.jpg'}}]}});}return new Response(null,{status:403});}});
 assert.deepEqual(r.errors,['REFERENCE_HTTP_403']);assert.equal(calls,2);
 assert.deepEqual(r.requestFailures,[{status:403,stage:'image',url:'https://upload.wikimedia.org/church.jpg'}]);
 const apiFailure=await footprintReference({name:'Church',source:'https://it.wikipedia.org/wiki/Exact_Church'},{fetcher:async()=>new Response(null,{status:403})});
 assert.equal(apiFailure.requestFailures[0].stage,'wikipedia_api');
 assert.equal(new URL(apiFailure.requestFailures[0].url).searchParams.get('titles'),'Exact_Church');
 assert.equal(apiFailure.requestFailures[0].status,403);
 assert.equal((await footprintReference({source:'https://private.example/wiki/Church'},{fetcher:async()=>{throw Error('must not fetch');}})).errors[0],'REFERENCE_ARTICLE_REQUIRED');
});

test('landmark lookup identifies both API and image requests and retries old failed cache once',async()=>{
 const objects=new Map(),bucket={get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null,put:async(k,v)=>objects.set(k,v)};
 const id='c'.repeat(32),row={id,name:'Exact Church',source:'https://de.wikipedia.org/wiki/Exact_Church'},key='reference-photos/footprint-v1/'+id+'.json';
 await bucket.put(key,JSON.stringify({status:'failed',photos:[],errors:['REFERENCE_HTTP_403'],lookupVersion:'footprint-reference-v1',expiresAt:9999999,retryAt:9999999}));
 let requests=0;const lookup=r=>footprintReference(r,{fetcher:async(url,init)=>{
  requests++;assert.equal(init.headers['User-Agent'],referenceUserAgent);assert.match(referenceUserAgent,/Bot\/.*https:\/\/hun-em-europe\.rammus-shigoto\.chatgpt\.site/);
  assert.equal(init.redirect,'manual');
  return String(url).includes('/w/api.php')?Response.json({query:{pages:[{pageimage:'Church.jpg',thumbnail:{source:'https://thumb.wikimedia.org/church.jpg'}}]}}):new Response(jpeg);
 }});
 const cache=footprintReferenceCache({bucket,now:()=>1000,lookup});await cache.prepare(row);await cache.prepare(row);
 assert.equal(requests,2,'old failure retried once; successful bytes reused without new download');assert.equal((await cache.read(id)).photos.length,1);
});

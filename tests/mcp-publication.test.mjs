import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {validateDailyWriting,digest,writingContent,writingMode} from 'file:///D:/Work/Hum-em_EuroTruck/lib/daily-writing.mjs';
const require=createRequire(import.meta.url),{build}=require('esbuild');
const input=JSON.parse(readFileSync('D:/Work/Hum-em_EuroTruck/data/downloads/hunem-2026-10-17-4c8c8119/input.json'));
const objects=new Map(),rows=new Map(),images=new Map();let liveWrites=0;
const formal={world:{now:Date.now(),publicationJobs:[{id:input.id,day:input.day,status:'published',input:structuredClone(input),draft:structuredClone(input.draft)}],diaries:[{day:input.day,title:'original'}]}};
const object=b=>({json:async()=>JSON.parse(b.toString()),arrayBuffer:async()=>Uint8Array.from(b).buffer});
const DB={prepare(sql){let v;return {bind(...a){v=a;return this},async first(){if(sql.startsWith('SELECT path'))return [...images].find(([key,hash])=>hash===v[0]&&key!==v[1])?{path:'old'}:null;if(sql.startsWith('SELECT value'))return rows.get(v[0])||null;if(sql.includes('RETURNING')){const row=rows.get(v[2]);if(!row||row.lease&&row.lease_until>=v[3])return null;Object.assign(row,{lease:v[0],lease_until:v[1]});return {...row};}throw Error(sql)},async run(){if(sql.startsWith('INSERT')){rows.set(v[0],{value:v[1],revision:0,updated_at:v[3]});return {meta:{changes:1}};}if(sql.includes('SET value=')){const row=rows.get(v[3]);if(row.revision!==v[4]||row.lease!==v[5])return {meta:{changes:0}};Object.assign(row,{value:v[0],revision:v[1],lease:null});return {meta:{changes:1}};}if(sql.includes('SET lease=NULL')){const row=rows.get(v[0]);if(row?.lease===v[1])row.lease=null;return {meta:{changes:1}};}throw Error(sql)}}}};
globalThis.__mcpTest={env:{DB,BUCKET:{put:async(k,v)=>objects.set(k,Buffer.from(v)),get:async k=>objects.has(k)?object(objects.get(k)):null}},runtime:{committed:async()=>structuredClone(formal),transaction:async fn=>{liveWrites++;return fn(formal)},engine:{validateDailyWriting,digest,writingContent,writingMode,realDay:()=>input.day,publicationDeadline:()=>Date.now()+3600000,publicationFolder:()=>'/isolated',writeFileSync:()=>{throw Error('PILOT_MUST_NOT_WRITE_FILES')},syncTeaching:()=>{throw Error('PILOT_MUST_NOT_SYNC_TEACHING')}},getObject:async k=>objects.has(k)?object(objects.get(k)):null,putObject:async(k,buffer)=>{objects.set(k,Buffer.from(buffer));images.set(k,createHash('sha256').update(Buffer.from(buffer)).digest('hex'));},binaryHash:x=>createHash('sha256').update(x).digest('hex')}};
const built=await build({entryPoints:['lib/mcp-publication.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'isolated-env',setup(b){b.onResolve({filter:/^\.\/runtime$/},()=>({path:'runtime',namespace:'mock'}));b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='env'?'export const env=globalThis.__mcpTest.env;':'export const {committed,transaction,engine,getObject,putObject,binaryHash}=globalThis.__mcpTest.runtime; export class Conflict extends Error {};'}));}}]});
const {mcpPublicationHandlers}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('native MCP pilot validates, attaches and publishes independently of the formal world',async()=>{
 const before=JSON.stringify(formal),h=mcpPublicationHandlers('owner'),c=await h.hunem_prepare_publication({mode:'pilot'});assert.equal(c.scope,'pilot');assert.equal(c.lease,undefined);assert.equal(c.input.draft,undefined);
 await assert.rejects(mcpPublicationHandlers('other').hunem_publication_progress({session:c.session}),/OWNER_MISMATCH/);
 const phrase='Today my truck rests while I walk outside and enjoy a quiet afternoon near the town.';
 const review=Object.fromEntries(['firstPerson','characterVoice','factsConsistent','translationsConsistent','levelChecked','grammarExplained','recentDiariesCompared','grammarUsageChecked','vocabularyChecked'].map(k=>[k,true]));Object.assign(review,{focus:'隔離測試',eventIndices:[0],sourceKeys:['location']});
 const d={title:'隔離測試',zh:'今天卡車留在休息站，我搭車到附近散步，午後回到住宿地點。'.repeat(6),learning:Object.fromEntries(['en','de','ja'].map(l=>[l,{text:phrase,grammar:[[phrase,'這是依當天事件創作的隔離測試文法解析。']],grammarIds:input.learningPlan[l].grammarIds,words:['truck：卡車','walk：散步','afternoon：下午']}]))};
 d.learning.de.words=['absent：未出現','truck：卡車','walk：散步'];
 const invalid=await h.hunem_submit_writing({session:c.session,action:'validate',draft:d,review});assert.equal(invalid.valid,false);
 assert.equal((await h.hunem_submit_writing({session:c.session,action:'validate',patch:{learning:{de:{words:['truck：卡車','walk：散步','afternoon：下午']}}}})).valid,true);
 assert.equal((await h.hunem_submit_writing({session:c.session,action:'write'})).written,true);
 assert.equal((await h.hunem_publication_progress({session:c.session,includeContent:true})).writing.zh,d.zh);
 objects.set('illustrations/hunem-reference-v2.png',readFileSync('D:/Work/Hum-em_EuroTruck/public/illustrations/hunem-reference-v2.png'));
 const ref=await h.hunem_reference_art({session:c.session});assert.match(ref.content[0].text,/1:1/);assert.match(c.input.imageRequests[0].instruction,/1254×1254/);
 const landscape=readFileSync('D:/Work/Hum-em_EuroTruck/data/journal-recovery-20261019/daily-sketch.png'),savedFetch=globalThis.fetch,beforeImages=images.size;
 globalThis.fetch=async()=>new Response(landscape);
 try{await assert.rejects(h.hunem_receive_illustration({session:c.session,file:{file_id:'landscape-fixture',download_url:'https://files.oaiusercontent.com/landscape-fixture'},review:{}}),/IMAGE_FORMAT_REQUIRED/);}finally{globalThis.fetch=savedFetch;}
 assert.equal(images.size,beforeImages);assert.equal((await h.hunem_publication_progress({session:c.session})).imageReady,false);
 const png=readFileSync('D:/Work/Hum-em_EuroTruck/public/illustrations/munich.png'),originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(png);
 try{
  const args={session:c.session,file:{file_id:'test-fixture-not-real-imagegen',download_url:'https://files.oaiusercontent.com/isolated-fixture'},review:{tool:'image_gen.imagegen',actuallyCalled:true,originalGeneratedPath:'synthetic-unit-test-only',visualReview:{blackFur:true,yellowScarf:true,newComposition:true}}};
  await assert.rejects(h.hunem_receive_illustration(args),/IMAGE_VARIETY_REVIEW_REQUIRED/);assert.equal(images.size,beforeImages);
  Object.assign(args.review.visualReview,{recentArtCompared:true,poseViewVaried:true});
  const attached=await h.hunem_receive_illustration(args);assert.equal(attached.attached,true);
 }finally{globalThis.fetch=originalFetch;}
 assert.equal((await h.hunem_publish_journal({session:c.session})).published,true);
 assert.equal((await h.hunem_publish_journal({session:c.session})).action,'already-published');
 const end=await h.hunem_publication_progress({session:c.session});assert.equal(end.published,true);assert.equal(end.scope,'pilot');assert.ok(end.imageSha256);
 assert.equal(liveWrites,0);assert.equal(JSON.stringify(formal),before);assert.ok([...objects.keys()].some(k=>k.startsWith('archive/mcp-pilot/')));
});
test('reference art returns at most two prior published illustrations, excluding today and future',async()=>{
 const h=mcpPublicationHandlers('owner'),c=await h.hunem_prepare_publication({mode:'pilot'}),old=structuredClone(formal.world.diaries),png=readFileSync('D:/Work/Hum-em_EuroTruck/public/illustrations/munich.png');
 try{formal.world.diaries=[{day:'2026-10-12',illustrations:[{src:'/old.png',name:'old'}]},{day:'2026-10-15',illustrations:[{src:'/recent-a.png',name:'A'}]},{day:'2026-10-16',illustrations:[{src:'/recent-b.png',name:'B'}]},{day:input.day,illustrations:[{src:'/today.png',name:'today'}]},{day:'2099-01-01',illustrations:[{src:'/future.png',name:'future'}]}];for(const key of ['recent-a.png','recent-b.png'])objects.set(key,png);const result=await h.hunem_reference_art({session:c.session});assert.equal(result.content.filter(x=>x.type==='image').length,3);const labels=result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');assert.match(labels,/2026-10-16/);assert.match(labels,/2026-10-15/);assert.ok(!labels.includes('2099-01-01'));assert.ok(!labels.includes('2026-10-12'));}finally{formal.world.diaries=old;}
});

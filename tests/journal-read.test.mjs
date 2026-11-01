import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {publishedJournal} from '../bridge/published-journal.mjs';
import {pilotRpc,pilotTools} from '../bridge/mcp-pilot.mjs';
const message=args=>({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'hunem_read_journal',arguments:args}});
const fixture=()=>({world:{now:12,diaries:[{day:'2026-10-30',zh:'older'},{day:'2026-10-31',title:'昨日',zh:'正文',learning:{en:{level:'A2',text:'English',words:['day：日'],secret:'hidden'},de:{text:'Deutsch'},ja:{text:'日本語'}},publication:{id:'published',publishedAt:'yesterday',writing:'ai',secret:'hidden'},secret:'hidden'}],publicationJobs:[{day:'2026-11-01',status:'pending',draft:{zh:'unpublished'}}]},files:{secret:'hidden'}});
test('only committed published four-language content is returned, never jobs/secrets; source and output are independent',()=>{
 const p=fixture(),before=structuredClone(p),r=publishedJournal(p,{});
 assert.equal(r.day,'2026-10-31');assert.equal(r.learning.en.text,'English');assert.equal(r.learning.de.text,'Deutsch');assert.equal(r.learning.ja.text,'日本語');assert.equal(r.mutated,false);
 assert.equal(publishedJournal(p,{day:'2026-10-30'}).zh,'older');assert.throws(()=>publishedJournal(p,{day:'2026-11-01'}));assert.throws(()=>publishedJournal({world:{diaries:[]}}));
 assert.doesNotMatch(JSON.stringify(r),/hidden|unpublished/);r.learning.en.words.push('test');assert.deepEqual(p,before);
});
test('RPC requires identity, rejects malformed/extra arguments before reading, advertises pure-read scope',async()=>{
 let reads=0;const deps={identity:'owner',readJournal:async a=>{reads++;return publishedJournal(fixture(),a);}};
 assert.equal((await pilotRpc(message({}),{...deps,identity:null})).error.code,-32001);
 for(const a of [{day:'2026-02-30'},{day:'2026-13-01'},{day:42},{day:'today'},{session:'secret'},[]])assert.equal((await pilotRpc(message(a),deps)).error.code,-32602);
 assert.equal(reads,0);const r=await pilotRpc(message({day:'2026-10-31'}),deps);assert.equal(JSON.parse(r.result.content[0].text).zh,'正文');assert.equal(reads,1);
 const t=pilotTools.find(t=>t.name==='hunem_read_journal');assert.equal(t.annotations.readOnlyHint,true);assert.equal(t.annotations.openWorldHint,false);
});
test('actual MCP route rejects non-owner before snapshot; journal read calls only committed, never ticket or writers',async()=>{
 let reads=0;const p=fixture(),before=structuredClone(p),forbidden=()=>{throw Error('Unexpected writer or credential request');};
 globalThis.__journalTest={committed:async()=>{reads++;return p;},publishedJournal,pilotRpc,publicationTools:[],footprintTools:[],collectionTools:[],fileProbeTool:{name:'probe'},mcpPublicationHandlers:()=>({}),platformOwner:r=>r.headers.get('test-owner')==='yes',platformBootstrap:()=>false,serviceTicket:forbidden,readPlatformPng:forbidden,env:{}};
 const source=fs.readFileSync(new URL('../app/mcp/route.ts',import.meta.url),'utf8').replace(/^import \{([^}]+)\} from [^;]+;/gm,(_,names)=>`const {${names}}=globalThis.__journalTest;`);
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,route=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const req=owner=>new Request('https://test.site/mcp',{method:'POST',headers:{'test-owner':owner?'yes':'no','oai-authenticated-user-id':'owner'},body:JSON.stringify(message({day:'2026-10-31'}))});
 assert.equal((await route.POST(req(false))).status,403);assert.equal(reads,0);
 const response=await route.POST(req(true)),r=await response.json();assert.equal(response.status,200);assert.equal(JSON.parse(r.result.content[0].text).zh,'正文');assert.equal(reads,1);assert.deepEqual(p,before);
 p.world.publicationJobs=[{day:'2026-10-31',status:'published',id:'test',input:{}}];
 Object.assign(globalThis.__journalTest,{writingPacket:()=>({events:[],learningPlan:{}}),publicationMetrics:()=>({}),binaryHash:()=>''});
 // Import again so callback bindings include the packet helpers.
 const js2=ts.transpileModule(source+'\n// compatibility-test',{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,route2=await import('data:text/javascript;base64,'+Buffer.from(js2).toString('base64'));
 const packetReq=new Request('https://test.site/mcp',{method:'POST',headers:{'test-owner':'yes','oai-authenticated-user-id':'owner'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'hunem_read_writing_packet',arguments:{day:'2026-10-31',includePacket:true}}})});
 const packetResponse=await(await route2.POST(packetReq)).json(),content=JSON.parse(packetResponse.result.content[0].text);assert.equal(content.journal.zh,'正文');assert.equal(content.journal.mutated,false);
});

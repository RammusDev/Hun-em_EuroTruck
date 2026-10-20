import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyStatus} from '../bridge/journey-status.mjs';
import {pilotRpc} from '../bridge/mcp-pilot.mjs';
import fs from 'node:fs';
import ts from 'typescript';
const now=Date.parse('2026-10-20T12:00:00Z');
function fixture(){return {world:{now,realAt:now-60000,speed:1,location:'flensburg',outing:{phase:'outbound',start:now-300000,end:now+300000,waitMinutes:10,place:{name:'市中心',secret:'hidden'},transportMode:'passenger'},tourPlans:{'2026-10-20':{kind:'explore',cityId:'flensburg',startedAt:now-300000,completed:[]}},events:[{type:'walk_started',time:now,name:'市中心',secret:'hidden'},{type:'expense',time:now,secret:'hidden'}]},files:{secret:'hidden'}};}
test('saved positions, wait timing and freshness are projected without mutation or private fields',()=>{
 const p=fixture(),before=JSON.stringify(p),view={position:[54.8,9.4],truckPosition:[54.7,9.3],status:'候車',activity:{kind:'waiting',title:'候車',target:'市中心',until:now+300000},googleKey:'hidden'};
 const r=journeyStatus(p,view,now);assert.equal(r.activity.phase,'waiting');assert.equal(r.activity.waitingUntil,now+300000);assert.equal(r.sync.lagMs,60000);assert.deepEqual(r.location.personPosition,[54.8,9.4]);assert.notDeepEqual(r.location.personPosition,r.location.truckPosition);assert.equal(r.recentMovementEvents.length,1);assert.equal(JSON.stringify(p),before);assert.ok(!JSON.stringify(r).includes('hidden'));
});
test('meal and operation override tour activity; finished tours and paused worlds are explicit',()=>{
 const p=fixture();p.world.mealPause={start:now,end:now+1800000};assert.equal(journeyStatus(p,{},now).activity.phase,'meal');p.world.operation={start:now,end:now+1000};assert.equal(journeyStatus(p,{},now).activity.phase,'operation');delete p.world.operation;delete p.world.mealPause;delete p.world.outing;p.world.speed=0;p.world.tourPlans['2026-10-20'].finishedAt=now;const r=journeyStatus(p,{activity:{kind:'finished'}},now);assert.equal(r.activity.phase,'finished');assert.equal(r.tour.finishedAt,now);assert.equal(r.sync.paused,true);
});
test('missing/invalid positions and timestamps stay unknown, recent events are bounded',()=>{
 const p=fixture();delete p.world.realAt;p.world.events=Array.from({length:30},()=>({type:'visit',time:now}));const r=journeyStatus(p,{position:[NaN,3]},now);assert.equal(r.location.personPosition,null);assert.equal(r.sync.lagMs,null);assert.equal(r.recentMovementEvents.length,8);
});
test('MCP refuses unauthenticated calls before touching saved diagnostics',async()=>{
 let reads=0;const r=await pilotRpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'hunem_status'}},{readStatus:()=>{reads++;}});assert.equal(r.error.code,-32001);assert.equal(reads,0);
});
test('actual MCP route retains owner gate and reads only a committed snapshot',async()=>{
 const p=fixture();Object.assign(p.world,{diaries:[],publicationWorldId:'test-world'});let reads=0;
 globalThis.__journeyTest={committed:async()=>{reads++;return p;},binaryHash:()=>'',engine:{snapshot:s=>({position:[1,2],truckPosition:[3,4],status:'候車',activity:{kind:'waiting'}})},journeyStatus,pilotRpc,writingPacket:()=>({}),publicationMetrics:()=>({}),fileProbeTool:{name:'probe'},readPlatformPng:()=>{},publicationTools:[],mcpPublicationHandlers:()=>({}),platformOwner:r=>r.headers.get('test-owner')==='yes',platformBootstrap:()=>false,serviceTicket:()=>{throw Error('unexpected write');}};
 let source=fs.readFileSync(new URL('../app/mcp/route.ts',import.meta.url),'utf8').replace(/^import \{([^}]+)\} from [^;]+;/gm,(_,names)=>`const {${names}}=globalThis.__journeyTest;`);
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const route=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const request=owner=>new Request('https://test.site/mcp',{method:'POST',headers:{'test-owner':owner?'yes':'no','oai-authenticated-user-id':owner?'owner':'other'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'hunem_status'}})});
 assert.equal((await route.POST(request(false))).status,403);assert.equal(reads,0);
 const before=JSON.stringify(p),r=await (await route.POST(request(true))).json(),status=JSON.parse(r.result.content[0].text);assert.equal(reads,1);assert.equal(status.statusVersion,2);assert.equal(status.mutated,false);assert.equal(status.platformOwnerPinned,true);assert.equal(JSON.stringify(p),before);
});

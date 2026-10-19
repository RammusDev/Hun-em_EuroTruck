import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {seal} from '../lib/probe.mjs';
test('service ticket requires pinned platform owner; validates audience, purpose, expiry and signature',async()=>{
 const secret='test-service-secret-'.repeat(3);globalThis.__worldAuthEnv={WORLD_OWNER_PLATFORM_ID:'pinned-id',OWNER_EMAIL:'owner@gmail.com',WORLD_SERVICE_SECRET:secret};
 let source=fs.readFileSync(new URL('../lib/world-auth.ts',import.meta.url),'utf8').replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__worldAuthEnv;');for(const name of ['probe','access','world-policy'])source=source.replace(`'./${name}.mjs'`,JSON.stringify(new URL(`../lib/${name}.mjs`,import.meta.url).href));
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const auth=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const req=headers=>new Request('https://world.test/mcp',{headers});
 await assert.rejects(()=>auth.serviceTicket(req({'oai-authenticated-user-id':'other','oai-authenticated-user-email':'owner@gmail.com'})));
 await assert.rejects(()=>auth.serviceTicket(req({'oai-authenticated-user-id':'pinned-id','oai-authenticated-user-email':'other@gmail.com'})));
 const ticket=await auth.serviceTicket(req({'oai-authenticated-user-id':'pinned-id','oai-authenticated-user-email':'owner@gmail.com'}));assert.equal(ticket.expiresIn,300);assert.equal((await auth.worldActor(req({'Cookie':'__Host-hunem_service='+ticket.ticket}))).role,'service');
 for(const payload of [{kind:'wrong',aud:'https://world.test',scopes:['sync'],exp:Date.now()+10000},{kind:'world-service',aud:'https://other.test',scopes:['sync'],exp:Date.now()+10000},{kind:'world-service',aud:'https://world.test',scopes:['admin'],exp:Date.now()+10000},{kind:'world-service',aud:'https://world.test',scopes:['sync'],exp:Date.now()-1}]){const value=await seal(payload,secret);await assert.rejects(()=>auth.worldActor(req({'Cookie':'__Host-hunem_service='+value})));}
 await assert.rejects(()=>auth.worldActor(req({'Cookie':'__Host-hunem_service='+ticket.ticket+'x'})));
 const status={method:'tools/call',params:{name:'hunem_status'}},verified=req({'oai-authenticated-user-id':'formal-site-id','oai-authenticated-user-email':'owner@gmail.com'});
 Object.assign(globalThis.__worldAuthEnv,{WORLD_OWNER_BOOTSTRAP:'true',WORLD_OWNER_PLATFORM_ID:''});
 assert.equal(auth.platformBootstrap(verified,status),true);
 assert.equal(auth.platformBootstrap(verified,{method:'tools/call',params:{name:'hunem_prepare_publication'}}),false);
 assert.equal(auth.platformBootstrap(req({'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@gmail.com'}),status),false);
 assert.equal(auth.platformBootstrap(req({'oai-authenticated-user-email':'owner@gmail.com'}),status),false);
 globalThis.__worldAuthEnv.WORLD_OWNER_PLATFORM_ID='formal-site-id';assert.equal(auth.platformBootstrap(verified,status),false);
 globalThis.__worldAuthEnv.WORLD_OWNER_PLATFORM_ID='';globalThis.__worldAuthEnv.WORLD_OWNER_BOOTSTRAP='false';assert.equal(auth.platformBootstrap(verified,status),false);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {generateKeyPair,SignJWT} from 'jose';
import {seal,inspectSeal} from '../lib/probe.mjs';
import {flowCookieName} from '../lib/login-flow.mjs';

async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const f of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')))sql.exec(fs.readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const db={prepare(q){const st=sql.prepare(q);let args=[];return {bind(...a){args=a;return this;},async first(){return st.get(...args)||null;},execute(){return {meta:{changes:Number(st.run(...args).changes)}};},async run(){return this.execute();}};},async batch(sts){sql.exec('BEGIN');try{const out=sts.map(s=>s.execute());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const keys=await generateKeyPair('RS256');
 const env={DB:db,GOOGLE_CLIENT_ID:'test-client',PROBE_SESSION_SECRET:'local-test-secret-'.repeat(4),OWNER_EMAIL:'owner@gmail.com',testPublicKey:keys.publicKey};
 globalThis.__loginEnv=env;
 let source=fs.readFileSync(new URL('../app/probe/[action]/route.ts',import.meta.url),'utf8')
  .replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__loginEnv;')
  .replace('const user=await verifyGoogleIdToken(credential,client,flow.nonce);','const user=await verifyGoogleIdToken(credential,client,flow.nonce,{keyResolver:env.testPublicKey});')
  .replace('user=await verifyGoogleIdToken(credential,client,flow.nonce);','user=await verifyGoogleIdToken(credential,client,flow.nonce,{keyResolver:env.testPublicKey});');
 for(const f of ['probe','access','google-id','login-flow'])source=source.replace(`'../../../lib/${f}.mjs'`,JSON.stringify(new URL('../lib/'+f+'.mjs',import.meta.url).href));
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const route=await import('data:text/javascript;base64,'+Buffer.from(js+'\n// '+crypto.randomUUID()).toString('base64'));
 async function post(path,body={},cookie='',origin='https://world.test'){
  return route.POST(new Request('https://world.test/probe/'+path,{method:'POST',headers:{origin,'Content-Type':'application/json',cookie},body:JSON.stringify(body)}));
 }
 async function prepare(){const r=await post('prepare');assert.equal(r.status,200);return {...await r.json(),cookie:r.headers.getSetCookie()[0].split(';')[0]};}
 async function token(nonce,patch={},key=keys.privateKey){const seconds=Math.floor(Date.now()/1000);return new SignJWT({iss:'https://accounts.google.com',aud:'test-client',sub:'test-reader',email:'reader@gmail.com',email_verified:true,iat:seconds,exp:seconds+300,nonce,...patch}).setProtectedHeader({alg:'RS256',kid:'test'}).sign(key);}
 return {sql,env,route,post,prepare,token};
}

test('seal diagnostics distinguish missing, invalid and expired without weakening session validation',async()=>{
 const secret='test-only-secret-'.repeat(3);
 assert.equal((await inspectSeal('',secret)).code,'flow_missing');
 assert.equal((await inspectSeal('forged',secret)).code,'flow_invalid');
 assert.equal((await inspectSeal(await seal({exp:1},secret),secret)).code,'flow_expired');
 assert.equal((await inspectSeal(await seal({exp:Date.now()+60000},secret),secret)).code,null);
});

test('independent tabs retain nonce/cookie binding, valid RS256 login and server session readback',async()=>{
 const f=await fixture(),a=await f.prepare(),b=await f.prepare();
 assert.notEqual(a.cookie.split('=')[0],b.cookie.split('=')[0]);
 const jar=a.cookie+'; '+b.cookie;
 for(const flow of [a,b])assert.equal((await f.post('check',{nonce:flow.nonce},jar)).status,200);
 const credential=await f.token(a.nonce);
 const accepted=await f.post('verify',{nonce:a.nonce,credential},jar);assert.equal(accepted.status,200);
 const cookies=accepted.headers.getSetCookie();assert.match(cookies[0],/Secure; HttpOnly; SameSite=Lax; Max-Age=604800/);
 assert.ok(cookies[1].startsWith(flowCookieName(a.nonce)+'='));assert.ok(!cookies[1].startsWith(flowCookieName(b.nonce)+'='));
 const status=await f.route.GET(new Request('https://world.test/probe/status',{headers:{cookie:cookies[0].split(';')[0]}}));
 assert.equal(status.status,200);assert.equal((await status.json()).googleSessionValid,true);
 assert.equal((await f.post('verify',{nonce:b.nonce,credential:await f.token(b.nonce)},jar)).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM sessions').get().n,2);
});

test('flow failures are specific, log only safe reason/request ID, and never consume invalid Google identities',async()=>{
 const f=await fixture(),a=await f.prepare(),b=await f.prepare(),warnings=[],original=console.warn;
 console.warn=x=>warnings.push(JSON.parse(x));
 try{
  async function failure(path,body,cookie,code,status=403){const r=await f.post(path,body,cookie);assert.equal(r.status,status);const d=await r.json();assert.equal(d.code,code);assert.ok(d.requestId);}
  await failure('check',{nonce:a.nonce},'','flow_missing');
  await failure('verify',{nonce:a.nonce,credential:await f.token(a.nonce)},a.cookie+'x','flow_invalid');
  await failure('check',{nonce:a.nonce},flowCookieName(a.nonce)+'='+await seal({nonce:a.nonce,exp:1},f.env.PROBE_SESSION_SECRET),'flow_expired');
  await failure('check',{nonce:a.nonce},flowCookieName(a.nonce)+'='+await seal({nonce:b.nonce,exp:Date.now()+60000},f.env.PROBE_SESSION_SECRET),'flow_invalid');
  await failure('verify',{nonce:a.nonce,credential:await f.token(b.nonce)},a.cookie,'verification_failed',401);
  const attacker=await generateKeyPair('RS256');
  await failure('verify',{nonce:a.nonce,credential:await f.token(a.nonce,{},attacker.privateKey)},a.cookie,'verification_failed',401);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM sessions').get().n,0);
  assert.ok(f.sql.prepare('SELECT nonce FROM auth_flows WHERE nonce=?').get(a.nonce));
  assert.ok(warnings.every(x=>Object.keys(x).sort().join(',')==='code,event,requestId'));
  assert.equal((await f.post('prepare',{},'','https://attacker.test')).status,403);
 }finally{console.warn=original;}
});

test('concurrent replay creates one session; pages open before deployment remain compatible',async()=>{
 const f=await fixture(),a=await f.prepare(),credential=await f.token(a.nonce);
 const results=await Promise.all([f.post('verify',{nonce:a.nonce,credential},a.cookie),f.post('verify',{nonce:a.nonce,credential},a.cookie)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,403]);assert.equal((await results.find(r=>r.status===403).json()).code,'flow_used');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM sessions').get().n,1);
 const legacy=await f.prepare();
 assert.equal((await f.post('verify',{credential:await f.token(legacy.nonce)},'__Host-probe_flow='+legacy.cookie.split('=')[1])).status,200);
});

async function clientFixture(){
 const f=await fixture(),elements=Object.fromEntries(['button','message','login-retry'].map(id=>[id,{hidden:false,style:{},textContent:'',replaceChildren(){this.cleared=true;},addEventListener(){}}]));
 const jar=new Map(),calls=[],configs=[],redirects=[];let dropFlow=false,dropSession=false;
 const context=vm.createContext({document:{getElementById:id=>elements[id]},window:{hunemGoogleClient:'test-client'},location:{assign:path=>redirects.push(path)},google:{accounts:{id:{initialize:c=>configs.push(c),renderButton(){}}}},fetch:async(path,options={})=>{
  calls.push(path);
  const cookie=[...jar].filter(([name])=>!(dropFlow&&name.startsWith('__Host-probe_flow_'))).map(([k,v])=>k+'='+v).join('; ');
  const response=options.method==='POST'?await f.post(path.split('/').pop(),JSON.parse(options.body),cookie):await f.route.GET(new Request('https://world.test'+path,{headers:{cookie}}));
  for(const raw of response.headers.getSetCookie()){const pair=raw.split(';')[0],i=pair.indexOf('='),name=pair.slice(0,i),value=pair.slice(i+1);if(dropSession&&name==='__Host-probe_session')continue;if(value)jar.set(name,value);else jar.delete(name);}
  return response;
 }});
 vm.runInContext(fs.readFileSync(new URL('../public/login.js',import.meta.url),'utf8'),context);
 return {...f,elements,calls,configs,redirects,context,jar,setDropFlow(v){dropFlow=v;},setDropSession(v){dropSession=v;}};
}

test('client preflights cookies, ignores concurrent/completed callbacks and confirms saved session',async()=>{
 const c=await clientFixture();await c.context.prepareLogin();
 assert.deepEqual(c.calls,['/probe/prepare','/probe/check']);
 const result={credential:await c.token(c.configs[0].nonce)};
 await Promise.all([c.context.received(result),c.context.received(result)]);await c.context.received(result);
 assert.equal(c.calls.filter(x=>x==='/probe/verify').length,1);assert.deepEqual(c.redirects,['/']);
});

test('client blocks authorization if cookies unavailable and rebuilds a lost flow without a reload loop',async()=>{
 const blocked=await clientFixture();blocked.setDropFlow(true);await blocked.context.prepareLogin();
 assert.equal(blocked.configs.length,0);assert.equal(blocked.elements['login-retry'].hidden,false);assert.match(blocked.elements.message.textContent,/Cookie/);
 const c=await clientFixture();await c.context.prepareLogin();const old=c.configs[0].nonce;
 c.setDropFlow(true);
 // Missing cookie at callback triggers exactly one preparation attempt, then stops with recovery UI.
 await c.context.received({credential:await c.token(old)});
 assert.equal(c.calls.filter(x=>x==='/probe/prepare').length,2);assert.equal(c.redirects.length,0);
 c.setDropFlow(false);await c.context.prepareLogin();assert.notEqual(c.configs.at(-1).nonce,old);
 await c.context.received({credential:await c.token(c.configs.at(-1).nonce)});assert.deepEqual(c.redirects,['/']);
});

test('client does not report success when browser discards the session cookie',async()=>{
 const c=await clientFixture();
 // A previously valid session must not hide failure to save the newly verified session.
 const old=await c.prepare();const prior=await c.post('verify',{nonce:old.nonce,credential:await c.token(old.nonce)},old.cookie);
 const pair=prior.headers.getSetCookie()[0].split(';')[0];c.jar.set('__Host-probe_session',pair.slice(pair.indexOf('=')+1));
 await c.context.prepareLogin();c.setDropSession(true);
 await c.context.received({credential:await c.token(c.configs[0].nonce)});
 assert.equal(c.redirects.length,0);assert.equal(c.elements['login-retry'].hidden,false);assert.match(c.elements.message.textContent,/未保留登入狀態/);
});

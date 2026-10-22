import test from 'node:test';
import assert from 'node:assert/strict';
import {monitorReport,berlinParts,berlinTime,safeReason} from '../lib/monitor-report.mjs';
import {authorizeWorld} from '../lib/world-policy.mjs';
const now=Date.parse('2026-10-22T21:20:00Z'),day='2026-10-22';
export function fixture(at=now){return {world:{realAt:at-60000,now:at-60000,publicationJobs:[],diaries:[]},eventPlan:{version:1,until:at+3600000,offset:0,events:[{kind:'transition',dueAt:at+60000}],steps:[]}};}
test('Berlin wall-clock deadlines follow DST',()=>{
 assert.equal(berlinTime('2026-10-22','23:30'),Date.parse('2026-10-22T21:30Z'));
 assert.equal(berlinTime('2026-10-25','23:30'),Date.parse('2026-10-25T22:30Z'));
 assert.equal(berlinParts(now).day,day);
});
test('normal rest is healthy; projection and monitoring never mutate the world',()=>{
 const p=fixture(Date.parse('2026-10-22T12:00Z')),before=structuredClone(p),view={status:'在旅館休息',location:'x',cities:[{id:'x',name:'弗倫斯堡'}]};
 const r=monitorReport(p,view,{now:Date.parse('2026-10-22T12:00Z')});
 assert.equal(r.health,'ok');assert.equal(r.activity.location,'弗倫斯堡');assert.deepEqual(p,before);
});
test('overdue event and repeated road failures expose actionable distinct issues',()=>{
 const p=fixture();p.eventPlan.events[0].dueAt=now-15*60000;p.world.realAt=now-3600000;
 const r=monitorReport(p,{status:'等待',pendingJob:{blocked:true,attemptsToday:6,error:'token SUPER_SECRET'}},{now,clock:{failures:4,pending:{},lastFailure:{code:'SITE_HTTP_503'}}});
 assert.ok(r.issues.some(i=>i.key==='event-overdue'));assert.ok(r.issues.some(i=>i.key==='route-stalled'));assert.ok(r.issues.some(i=>i.key==='clock-retries'));assert.ok(!JSON.stringify(r).includes('SUPER_SECRET'));
});
test('unobserved claim differs from started writing and from image readiness',()=>{
 const p=fixture();p.world.publicationJobs=[{id:'job',day,status:'pending'}];
 let r=monitorReport(p,{},{now});assert.ok(r.issues.some(i=>i.key==='publication-unobserved:'+day));
 p.cloudMetrics={job:{claimedAt:now-5*60000}};p.cloudWriting={job:{}};r=monitorReport(p,{},{now});
 assert.ok(!r.issues.some(i=>i.key.startsWith('publication-unobserved')));assert.equal(r.publication[0].stage,'文章已完成，等待圖片');
 p.cloudImages={job:{}};assert.equal(monitorReport(p,{},{now}).publication[0].stage,'圖片已驗收，等待發布');
});
test('cutoff, missing archive and fallback are distinct, manual repair is labelled',()=>{
 const late=now+20*60000,p=fixture(late);let r=monitorReport(p,{},{now:late});assert.ok(r.issues.some(i=>i.key==='archive-missing:'+day));
 p.world.publicationJobs=[{id:'job',day,status:'generating'}];r=monitorReport(p,{},{now:late});assert.ok(r.issues.some(i=>i.key==='publication-overdue:'+day));
 p.world.diaries=[{day,publication:{id:'job',writing:'template-fallback'},illustrations:[]}];r=monitorReport(p,{},{now:late});assert.equal(r.publication[0].stage,'已無圖發布');assert.ok(r.issues.some(i=>i.key==='publication-fallback:'+day));
 p.world.diaries[0].illustrations=[{src:'/a.png'}];p.world.diaries[0].publication={id:'job',writing:'ai',recoveryId:'manual'};r=monitorReport(p,{},{now:late});assert.equal(r.publication[0].manualRecovery,true);assert.equal(r.issues.length,0);
});
test('future activity is a forecast and has a real timestamp',()=>{
 const p=fixture();p.eventPlan.steps=[{at:now+120000,publicPatch:[[['status'],1,'正在用餐']]}];
 const r=monitorReport(p,{status:'正在步行'},{now:Date.parse('2026-10-22T12:00Z')});assert.equal(r.activity.nextTitle,'正在用餐');assert.equal(r.activity.nextAt,now+120000);
});
test('raw errors never appear in classified reasons',()=>{assert.equal(safeReason('secret=abc email=private@example.com'),'已記錄失敗；平台未提供可確認的具體根因。');assert.match(safeReason('429 quota'),/額度/);});
test('monitor requires fresh owner and denies readers, services, stale owners',()=>{
 for(const actor of [{role:'user',reader:true},{role:'service',scopes:['publication','sync']},{role:'user',owner:true,adminFresh:false}])for(const method of ['GET','POST'])assert.throws(()=>authorizeWorld(actor,method,'/api/monitor'));
 assert.equal(authorizeWorld({role:'user',owner:true,adminFresh:true},'GET','/api/monitor'),'owner');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {berlinParts} from '../lib/monitor-report.mjs';
import {monitorHistory,monitorSchema,runMonitor,setMonitorEmail,deliverMonitor,recordToolFailure,readMonitor} from '../lib/monitor-store.mjs';
test('real D1: read-only GET, alert dedup, opt-in, recovery, concurrency and uncertain Gmail delivery',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated")}}',compatibilityDate:'2026-05-15',host:'127.0.0.1',port:0,d1Databases:['DB']});
 try{
  const DB=await mf.getD1Database('DB'),config={DB},at=Date.now(),p={world:{realAt:at-60000,now:at-60000,publicationJobs:[],diaries:[{day:berlinParts(at).day,illustrations:[{}]}]},eventPlan:{until:at+3600000,offset:0,events:[{kind:'transition',dueAt:at+60000}],steps:[]}},view={status:'休息中'};
  const empty=await monitorHistory(DB);assert.equal(empty.emailEnabled,false);assert.equal(await DB.prepare("SELECT name FROM sqlite_master WHERE name='monitor_settings'").first(),null);
  await monitorSchema(DB);await DB.prepare('CREATE TABLE world_sentinel(value TEXT)').run();await DB.prepare("INSERT INTO world_sentinel VALUES('unchanged')").run();
  p.eventPlan.events[0].dueAt=at-20*60000;p.world.realAt=at-3600000;
  await runMonitor(p,view,config,{now:at,force:true});let h=await monitorHistory(DB);assert.ok(h.incidents.some(i=>i.id==='event-overdue'));assert.equal(h.deliveries.length,0);
  await setMonitorEmail(DB,true);await Promise.all([runMonitor(p,view,config,{now:at+1,force:true}),runMonitor(p,view,config,{now:at+1,force:true})]);
  h=await monitorHistory(DB);const count=h.deliveries.length;assert.ok(count>0);await runMonitor(p,view,config,{now:at+2,force:true});assert.equal((await monitorHistory(DB)).deliveries.length,count);
  await DB.prepare("UPDATE monitor_delivery SET state='accepted' WHERE incident_id='event-overdue'").run();
  p.eventPlan.events[0].dueAt=at+3600000;await runMonitor(p,view,config,{now:at+3,force:true});h=await monitorHistory(DB);assert.equal(h.incidents.find(i=>i.id==='event-overdue').state,'resolved');assert.equal(h.deliveries.length,count+1);
  await recordToolFailure(DB,'job','reference_art',Error('secret SUPER_SECRET timeout'),at);h=await monitorHistory(DB);assert.ok(!JSON.stringify(h).includes('SUPER_SECRET'));
  const stateBefore=JSON.stringify(p);await readMonitor(p,view,config,{now:at});assert.equal(JSON.stringify(p),stateBefore);assert.equal((await DB.prepare('SELECT value FROM world_sentinel').first()).value,'unchanged');
  const mailConfig={...config,GOOGLE_CLIENT_ID:'test',GMAIL_CLIENT_SECRET:'test',GMAIL_REFRESH_TOKEN:'test',OWNER_EMAIL:'owner@gmail.com',GMAIL_SENDER_EMAIL:'sender@gmail.com',BACKGROUND_TICK_ORIGIN:'https://isolated.test'};
  let sends=0;const fetcher=async(url)=>{if(String(url).includes('oauth2'))return Response.json({access_token:'isolated-token'});sends++;throw Error('lost response');};
  assert.equal((await deliverMonitor(mailConfig,{now:Date.now(),fetcher})).state,'review');
  const review=await DB.prepare("SELECT id FROM monitor_delivery WHERE state='review'").first();assert.ok(review);
  await setMonitorEmail(DB,false);assert.equal((await deliverMonitor(mailConfig,{fetcher})).state,'disabled');assert.equal(sends,1);
  assert.equal((await DB.prepare('SELECT state FROM monitor_delivery WHERE id=?').bind(review.id).first()).state,'review');
 }finally{await mf.dispose();}
});

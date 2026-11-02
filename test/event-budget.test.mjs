import test from 'node:test';
import assert from 'node:assert/strict';
import {runEventClock,eventSchedule,rebuildEventPlan} from '../bridge/event-runtime.mjs';
import * as compiled from '../lib/core.mjs';
import fs from 'node:fs';

const minute=60000,at=Date.parse('2026-11-02T07:00:00Z');
function fixture(){
 const p={world:{now:at-minute,realAt:at-minute,diaries:[]},routes:{},eventPlan:{version:1409,until:at,offset:0,events:[]}},calls=[];
 const core={
  settlePlan(p,real){p.world.now=Math.min(real,p.eventPlan.until-minute);},eventRandom:()=>()=>.5,
  async tick(s,to,route){calls.push(['tick',s.now,to]);s.now=to;if(!s.job){const r=await route({from:'it-palermo',to:'de-frankfurt-oder'});if(r.verified)s.job={journey:{routeFingerprint:'fixed-route'}};}},
  async getRoute(){calls.push(['route']);return {verified:true};},
  reconcilePublications(){},syncTeaching(){},
  async prepareFerryArrival(job){calls.push(['shore']);return job&&!job.shoreReady?{job:{...job,shoreReady:true},changedRoute:true}:null;},
  plannedTopicAnchors:()=>[{key:'stop'}],
  createTopicResearcher:()=>({entries:{},async schedule(){calls.push(['research']);}}),
  async buildEventPlan(p,options){calls.push(['plan',options.maxMinutes]);const version=p.eventPlan.version+1,until=p.world.now+options.maxMinutes*minute,offset=p.world.realAt-p.world.now;return {version,until,offset,events:[{id:`${version}:boundary`,version,kind:'boundary',dueAt:until+offset,worldAt:until}]};},
 };
 return {p,core,calls};
}

test('new work, ferry roads and topic research persist as separate event invocations',async()=>{
 let {p,core,calls}=fixture();let backups=0;
 await runEventClock(p,core,{real:at,prepare:true,beforeShoreChange:async()=>{backups++;}});
 assert.deepEqual(calls.map(c=>c[0]),['tick','route','plan']);
 assert.equal(p.world.now,at);assert.equal(p.world.job.journey.routeFingerprint,'fixed-route');
 assert.ok(p.routes['it-palermo-de-frankfurt-oder-city-cloud-v2'].verified);
 await rebuildEventPlan(p,core,at);
 assert.ok(p.eventPlan.events.some(e=>e.id.includes(':preparation:')),'another legitimate world write must not drop deferred work');
 let next=eventSchedule(p).events.find(e=>e.id.includes(':preparation:'));assert.equal(next.kind,'prepare');
 // Simulate a new Worker invocation loading only the committed snapshot.
 p=JSON.parse(JSON.stringify(p));calls.length=0;
 await runEventClock(p,core,{real:next.dueAt,prepare:true,beforeShoreChange:async()=>{backups++;}});
 assert.deepEqual(calls.map(c=>c[0]),['shore','plan']);assert.equal(backups,1);assert.equal(p.world.job.shoreReady,true);
 next=eventSchedule(p).events.find(e=>e.id.includes(':preparation:'));assert.ok(next);
 p=JSON.parse(JSON.stringify(p));calls.length=0;
 await runEventClock(p,core,{real:next.dueAt,prepare:true});
 assert.deepEqual(calls.map(c=>c[0]),['shore','research','plan']);
 assert.ok(p.eventResearch);assert.ok(!p.eventPlan.events.some(e=>e.id.includes(':preparation:')));
 assert.ok(calls.filter(c=>c[0]==='plan').every(c=>c[1]===120));
});

test('hours of overdue work cross one unknown minute and keep the original real-time offset',async()=>{
 const {p,core,calls}=fixture(),real=at+7*3600000;
 await runEventClock(p,core,{real,prepare:false});
 assert.equal(p.world.now,at);assert.equal(p.world.realAt,at);
 const tick=calls.find(c=>c[0]==='tick');assert.equal(tick[2]-tick[1],minute);
 assert.equal(calls.filter(c=>c[0]==='route').length,1);
 assert.ok(p.eventPlan.events.some(e=>e.dueAt<real));
 assert.equal(p.eventPlan.until-p.world.now,120*minute);
});

test('a failed route attempt is saved before any further network preparation',async()=>{
 const {p,core,calls}=fixture();
 core.getRoute=async()=>{calls.push(['route']);return {verified:false};};
 await runEventClock(p,core,{real:at+7*3600000,prepare:true});
 assert.deepEqual(calls.map(c=>c[0]),['tick','route','plan']);
 assert.equal(p.world.now,at);assert.equal(p.world.job,undefined);
 assert.ok(p.eventPlan.events.some(e=>e.kind==='prepare'));
});

test('actual deployed core settles overdue meals and expenses identically across saved horizons',async()=>{
 const files=JSON.parse(fs.readFileSync(new URL('../bridge/static-files.json',import.meta.url),'utf8'));
 compiled.hydrate(files);
 const start=Date.parse('2026-11-02T10:58:00Z'),real=start+5*3600000;
 const p=compiled.freshWorldPayload({files,world:{publicationWorldId:'event-budget-isolated'}},files,start,'event-budget-isolated');
 Object.assign(p.world,{now:start,realAt:start,eventMode:true,homeStay:null,holiday:null,job:null,location:'it-palermo',stay:{name:'Isolated hotel',p:[13.3636,38.1166],cityId:'it-palermo'},workCycle:{deliveredDay:'2026-11-01',resumeDay:'2026-11-04',restDays:2},tourPlans:{'2026-11-02':{kind:'hotel-rest'}}});
 const expected=structuredClone(p.world),noRoute=async()=>{throw Error('Rest day must not route');};
 await compiled.tick(expected,real,noRoute,compiled.eventRandom(expected));
 const core={...compiled,getRoute:noRoute,prepareFerryArrival:async()=>null,createTopicResearcher:()=>({entries:{},schedule:async()=>{}})};
 let q=p,iterations=0;
 while(q.world.now<real){
  await runEventClock(q,core,{real});
  q=JSON.parse(JSON.stringify(q));
  assert.ok(++iterations<10,'overdue work must make bounded forward progress');
 }
 assert.equal(q.world.now,real);assert.equal(q.world.realAt,real);
 assert.deepEqual(q.world.events,JSON.parse(JSON.stringify(expected.events)));
 assert.deepEqual(q.world.economy,JSON.parse(JSON.stringify(expected.economy)));
 assert.equal(q.world.balance,expected.balance);
 assert.equal(q.world.eventRandomState,expected.eventRandomState);
 const once=JSON.stringify(q.world.events);await runEventClock(q,core,{real});assert.equal(JSON.stringify(q.world.events),once);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createEventTrace} from '../bridge/event-trace.mjs';
import {runEventClock} from '../bridge/event-runtime.mjs';

test('timing preserves return values and errors without logging arbitrary error text',async()=>{
 let clock=100;const rows=[],trace=createEventTrace('test',{id:'isolated',now:()=>clock,log:s=>rows.push(JSON.parse(s))});
 const value={same:true};assert.equal(await trace.span('read',async()=>{clock+=12;return value;}),value);
 const error=Error('secret-cookie-must-not-appear');await assert.rejects(trace.span('write',async()=>{throw error;}),e=>e===error);
 assert.equal(rows[1].sampledMs,12);assert.equal(rows.at(-1).state,'failed');assert.ok(!JSON.stringify(rows).includes(error.message));
});

test('diagnostics retain live 127 ordering, full catch-up and original preview horizon',async()=>{
 const minute=60000,real=Date.parse('2026-11-02T14:00Z'),p={world:{now:real-6*3600000,realAt:real-6*3600000,diaries:[]},routes:{},eventPlan:{version:1409,until:real-5*3600000,events:[]}},calls=[],rows=[];
 const core={settlePlan(){},eventRandom:()=>()=>.5,async tick(s,target,route){calls.push('tick');assert.equal(target,real);s.now=target;const r=await route({from:'it-palermo',to:'de-frankfurt-oder'});s.job={route:r,journey:{routeFingerprint:'saved',legs:[]}};},
 async getRoute(){calls.push('route');return {verified:true,coords:[[1,2],[3,4]]};},reconcilePublications(){calls.push('publications');},syncTeaching(){},
 async prepareFerryArrival(job){calls.push('shore');return {job,changedRoute:false};},plannedTopicAnchors:()=>[],createTopicResearcher:()=>({entries:{},schedule:async()=>{calls.push('research');}}),
 async buildEventPlan(p,options){calls.push('plan');assert.equal(options,undefined);return {version:1410,offset:0,steps:[],events:[]};}};
 await runEventClock(p,core,{real,prepare:true,trace:createEventTrace('isolated',{id:'isolated',log:s=>rows.push(JSON.parse(s))})});
 assert.deepEqual(calls,['tick','route','publications','shore','research','plan']);assert.equal(p.world.now,real);assert.equal(p.world.realAt,real);assert.equal(p.eventPlan.version,1410);assert.equal(p.eventPreparation,undefined);
 assert.equal(rows.find(r=>r.stage==='plan-input').routePoints,2);assert.ok(rows.some(r=>r.stage==='build-plan'&&r.state==='complete'));
});

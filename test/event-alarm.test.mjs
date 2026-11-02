import test from 'node:test';import assert from 'node:assert/strict';
import {EventClock,siteRequestTimeoutMs,recoveryAlarmDelayMs} from '../external-timer/event-worker.mjs';
function storage(){const values=new Map();let alarm=null;const s={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),setAlarm:async t=>{alarm=t;},transaction:async f=>f(s),alarm:()=>alarm};return s;}
const env={TICK_WORLD_ID:'test-world'};
test('pending delivery survives failure and restart, then installs the next event',async()=>{
 const st=storage(),due={id:'1:prepare',version:1,dueAt:Date.now()-1000};await st.put('schedule',{version:1,events:[due],failures:0});
 const a=new EventClock({storage:st},env);a.call=async()=>{throw Error('NETWORK_DOWN');};await a.alarm();const pending=await st.get('schedule');assert.equal(pending.pending.id,due.id);assert.ok(st.alarm()>Date.now());
 const b=new EventClock({storage:st},env);let sent;b.call=async options=>{sent=options;return {worldId:'test-world',version:2,architecture:'events-v1',events:[{id:'2:complete',version:2,dueAt:Date.now()+60000}]};};await b.alarm();assert.equal(sent.event.id,due.id);assert.equal(sent.requestId,pending.requestId);assert.equal((await st.get('schedule')).pending,null);assert.equal((await st.get('schedule')).events[0].id,'2:complete');
});
test('read-only reconciliation never drops an unacknowledged pending delivery',async()=>{
 const st=storage();await st.put('schedule',{version:3,pending:{id:'3:test',version:3,dueAt:Date.now()},events:[]});const a=new EventClock({storage:st},env);a.call=async()=>{throw Error('must not replace pending');};await a.fetch(new Request('https://internal/arm'));assert.equal((await st.get('schedule')).pending.id,'3:test');assert.ok(st.alarm()>Date.now());
});
test('old schedule cannot replace the current version and preparation retains completion',async()=>{
 const st=storage(),a=new EventClock({storage:st},env);await assert.rejects(()=>a.saveSchedule({worldId:'test-world',architecture:'events-v1',version:1,events:[]},{version:2}));
 const events=[{id:'2:prepare',version:2,dueAt:Date.now()+1000},{id:'2:complete',version:2,dueAt:Date.now()+2000}];await a.saveSchedule({worldId:'test-world',architecture:'events-v1',version:2,events},{});assert.equal((await st.get('schedule')).events.length,2);
});

test('the persisted recovery alarm outlasts the bounded Site request',async()=>{
 assert.equal(siteRequestTimeoutMs,60000);assert.ok(recoveryAlarmDelayMs>siteRequestTimeoutMs);
 const st=storage(),before=Date.now(),due={id:'1:complete',version:1,dueAt:before-1};
 await st.put('schedule',{version:1,events:[due]});
 const clock=new EventClock({storage:st},env);
 clock.call=async()=>{assert.ok(st.alarm()>=before+recoveryAlarmDelayMs);assert.equal((await st.get('schedule')).pending.id,due.id);return {worldId:env.TICK_WORLD_ID,architecture:'events-v1',version:2,events:[]};};
 await clock.alarm();assert.equal((await st.get('schedule')).pending,null);
});

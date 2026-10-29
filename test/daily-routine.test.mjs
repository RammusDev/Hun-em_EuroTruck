import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../lib/core.mjs';
import {initial,tick as sharedTick,dateParts} from '../../lib/engine.mjs';
import {city} from '../../lib/world.mjs';
import {actualTopicAnchor} from '../../lib/local-topics.mjs';
import {initEconomy,dailyEconomy} from '../../lib/economy.mjs';
import {finishMeals} from '../../lib/local-meals.mjs';
const day='2026-10-28',at=t=>Date.parse(`${day}T${t}Z`),minute=60000;
const noRoad=async()=>{throw Error('No road request during rest');};
function routineFixture(kind){
 const s=initial(at('05:59'));s.location='it-palermo';s.homePolicySince=s.now;
 s.publicationMode='codex-imagegen';s.publicationWorldId='isolated-daily-routine';
 if(kind!=='work'){
  s.workCycle={deliveredDay:kind==='delivery'?day:'2026-10-27',restStartDay:kind==='delivery'?'2026-10-29':day,resumeDay:'2026-11-02',restDays:4};
  s.duty={day,closed:true,driveSince:0,workSince:0,driveMinutes:0,workMinutes:0};
  s.stay={p:[...city(s.location).p],cityId:s.location,name:'測試住宿點'};
 }
 const anchor=actualTopicAnchor(s),p=city(s.location).p;
 s.localTopicCache={[anchor.key]:{anchor,status:'ready',landmarks:Array.from({length:12},(_,i)=>({id:`routine:${i}`,name:`Test landmark ${i}`,p:[p[0]+i*.0001,p[1]],cityId:s.location,source:'https://example.org/landmark',summary:'Fixture landmark in Palermo.'}))}};
 return s;
}
for(const [name,run] of [['shared',sharedTick],['compiled',core.tick]]){
 for(const kind of ['delivery','rest'])test(`${name}: ${kind} day follows the same meals, soda, return and archive schedule after reload`,async()=>{
  core.hydrate({});let s=routineFixture(kind);
  await run(s,at('10:59'),noRoad,()=>.5);
  s=JSON.parse(JSON.stringify(s));await run(s,at('22:00'),noRoad,()=>.5);
  const meals=s.events.filter(e=>e.type==='meal_finished');
  assert.deepEqual(meals.map(e=>e.meal),['breakfast','lunch','dinner']);
  assert.deepEqual(meals.map(e=>[dateParts(e.time).hour,dateParts(e.time).minutes]),[[7,20],[12,30],[19,30]]);
  for(const meal of ['breakfast','lunch','dinner'])assert.equal(s.economy.ledger.filter(e=>e.id===`meal:${day}:${meal}`).length,1);
  assert.equal(s.events.filter(e=>e.category==='soda').length,1);
  assert.equal(dateParts(s.events.find(e=>e.category==='soda').time).hour,7);
  assert.ok(s.tourPlans[day].finishedAt);assert.ok(s.tourPlans[day].returnStartedAt<=at('19:00'));
  assert.equal(dateParts(s.events.find(e=>e.category==='hotel').time).hour,21);
  assert.equal(s.publicationJobs.length,1);assert.equal(s.publicationJobs[0].day,day);
  const before=JSON.stringify(s);await run(s,s.now,noRoad,()=>.5);assert.equal(JSON.stringify(s),before);
  core.hydrate({});
 });
 test(`${name}: working day buys soda and stops for each meal once`,async()=>{
  core.hydrate({});const s=routineFixture('work');
  const road=async j=>({coords:[city(j.from).p,city(j.to).p],km:1800,verified:true,provider:'fixture'});
  await run(s,at('22:00'),road,()=>.5);
  const meals=s.events.filter(e=>e.type==='meal_finished');
  assert.deepEqual(meals.map(e=>e.meal),['breakfast','lunch','dinner']);
  const lunch=meals.find(e=>e.meal==='lunch');assert.ok(dateParts(lunch.time).hour<14,'road lunch finishes at a checkpoint before the afternoon');
  assert.equal(s.events.filter(e=>e.category==='soda').length,1);
  assert.equal(dateParts(s.events.find(e=>e.category==='hotel').time).hour,21);
  assert.equal(s.publicationJobs.length,1);core.hydrate({});
 });
 test(`${name}: an actual morning delivery cannot hand lunch off into a gap`,async()=>{
  core.hydrate({});const s=routineFixture('work');
  const road=async j=>({coords:[city(j.from).p,city(j.to).p],km:45,verified:true,provider:'fixture'});
  await run(s,at('22:00'),road,()=>.5);
  const delivery=s.events.find(e=>e.type==='delivered');assert.ok(delivery);assert.ok(dateParts(delivery.time).hour<12);
  assert.equal(s.tourPlans[day].fullDay,false);
  const lunch=s.events.filter(e=>e.type==='meal_finished'&&e.meal==='lunch');assert.equal(lunch.length,1);
  assert.equal(dateParts(lunch[0].time).hour,12);assert.equal(dateParts(lunch[0].time).minutes,30);
  assert.equal(s.events.filter(e=>e.type==='meal_finished'&&e.meal==='dinner').length,1);
  core.hydrate({});
 });
}
test('overdue meals never purchase or run simultaneously',()=>{
 const s=routineFixture('rest');initEconomy(s,dateParts(s.now));s.now=at('18:00');
 dailyEconomy(s,dateParts(s.now),{},()=>.5);
 assert.equal(s.pendingMeals.length,1);const firstEnd=s.mealPause.end;
 dailyEconomy(s,dateParts(s.now),{},()=>.5);assert.equal(s.pendingMeals.length,1);
 s.now=firstEnd;finishMeals(s);s.mealPause=null;dailyEconomy(s,dateParts(s.now),{},()=>.5);
 assert.equal(s.pendingMeals.length,1);assert.equal(s.pendingMeals[0].meal,'lunch');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../lib/core.mjs';
import {buildJourney,planDays} from '../../lib/journey.mjs';
import {initial,dateParts} from '../../lib/engine-v2.mjs';
import {initEconomy} from '../../lib/economy.mjs';
import {localTime} from '../../lib/flights.mjs';

const day='2026-11-03',at=t=>localTime(day,t),minute=60000;
function fixture(){
 const s=initial(at('07:59'));s.location='it-villa-san-giovanni';initEconomy(s,dateParts(s.now));
 const coords=[[15.63,38.22],[15.64,38.22],[20,42]],route={verified:true,km:1002,coords,segments:[{mode:'road',km:2,minutes:2,coords:coords.slice(0,2)},{mode:'road',km:1000,minutes:750,coords:coords.slice(1)}]};
 const journey=buildJourney(route);
 // A saved, verified city connection followed by the fixed delivery road.
 journey.legs=[{mode:'road',km:2,minutes:2,startKm:0,coords:coords.slice(0,2),stop:{id:'shore-city',cityId:s.location,p:coords[1],name:'shore city',shoreCity:true}},...Array.from({length:25},(_,i)=>({mode:'road',km:40,minutes:30,startKm:2+i*40,coords:[[15.64+i*.01,38.22],[15.65+i*.01,38.22]],stop:{id:'road-'+i,cityId:s.location,p:[15.65+i*.01,38.22],name:'safe checkpoint',fuel:true}}))];
 Object.assign(journey,{phase:'road',position:coords[0],shoreTargetId:'shore-city',shoreWaiting:true});
 s.job={from:'it-palermo',to:'de-frankfurt-oder',start:at('07:00'),route,journey};s.publicationMode='cloud-ai-v2';s.eventMode=true;s.realAt=s.now;
 s.duty={day,closed:false,driveSince:0,workSince:0,driveMinutes:0,workMinutes:0};return s;
}
test('deployed core passes shore city, keeps driving without any AI, and respects 16:00 after reload',async()=>{
 core.hydrate({});let s=fixture();const noNetwork=async()=>{throw Error('AI and network unavailable');};
 await core.tick(s,at('08:10'),noNetwork,()=>.5,{planning:true});
 assert.equal(s.duty.closed,false);assert.equal(s.job.journey.shoreTargetId,null);assert.ok(s.job.journey.roadDriven>2);
 assert.ok(!s.events.some(e=>e.type==='off_duty'));
 s=JSON.parse(JSON.stringify(s));await core.tick(s,at('16:00'),noNetwork,()=>.5,{planning:true});
 assert.equal(s.duty.closed,true);assert.ok(s.job.journey.roadDriven>300);assert.ok(s.duty.driveMinutes<=480);
 const km=s.job.journey.roadDriven;await core.tick(s,at('16:10'),noNetwork,()=>.5,{planning:true});assert.equal(s.job.journey.roadDriven,km);
});
test('forecast does not reserve a full overnight after a morning shore city',()=>{
 const s=fixture(),days=planDays(s.job.journey,at('08:00'),500);
 assert.ok(days[0].activities.filter(a=>a.type==='driving').length>1);
 assert.ok(days[0].activities.every(a=>dateParts(a.end).hour<=16));
});

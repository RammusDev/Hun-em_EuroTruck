import test from 'node:test';import assert from 'node:assert/strict';import * as core from '../lib/core.mjs';
import {multilingualWritingInstruction} from '../bridge/writing-coverage.mjs';
test('actual compiled 23:00 AI archive resolves shared writing dependencies and retains country food scope',async()=>{
 core.hydrate({});const day='2026-10-27',at=Date.parse(day+'T21:59Z');
 const s={version:1,publicationMode:'codex-imagegen',publicationWorldId:'isolated-archive',now:at,realAt:at,speed:1,location:'it-messina',job:null,events:[{type:'meal_finished',mealId:'fixture',time:at-3600000,day,meal:'dinner',location:'it-messina',food:{name:'Arancini',scope:'country',country:'IT',localDish:true,source:'https://en.wikivoyage.org/wiki/Italy#Eat'}}],diaries:[],totalKm:0,balance:0,lastDay:day,workCycle:{resumeDay:'2026-11-01',restDays:20,deliveredDay:'2026-10-26'}};
 await core.tick(s,at+60000,async()=>{throw Error('No network in archive fixture');},()=>.5);
 assert.equal(s.publicationJobs.length,1);const input=s.publicationJobs[0].input;
 assert.ok(input.writingInstruction.includes(multilingualWritingInstruction));assert.equal(input.writingContext.meals[0].food.scope,'country');assert.equal(s.diaries.length,0,'archiving does not pretend a diary was published');
 core.reconcilePublications(s,'/hunem/data',at+60000);assert.equal(s.publicationJobs.length,1);core.hydrate({});
});

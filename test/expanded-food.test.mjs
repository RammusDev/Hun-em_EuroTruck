import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../lib/core.mjs';
import files from '../bridge/static-files.json' with {type:'json'};
import {collectionInventory} from '../bridge/collections.mjs';
const day='2026-10-27',start=Date.parse(day+'T05:59Z');
test('deployed core buys an Italian soda even with the persisted legacy catalog',async()=>{
 const catalog=JSON.parse(files['/hunem/assets/sodas.json']);
 core.hydrate({'/hunem/assets/sodas.json':JSON.stringify({...catalog,version:2,products:catalog.products.filter(p=>p.country!=='IT')})});
 const s={version:1,now:start,realAt:start,speed:1,location:'it-potenza',job:null,events:[],diaries:[],totalKm:0,balance:0,lastDay:day,workCycle:{resumeDay:'2026-11-01',restDays:20,deliveredDay:'2026-10-26'}};
 await core.tick(s,start+22*60000,async()=>{throw Error('isolated fixture has no route');},()=>.5);
 assert.equal(s.sodaLife.bottle.country,'IT');
 assert.ok(catalog.products.some(p=>p.id===s.sodaLife.bottle.id));
 assert.equal(s.events.filter(e=>e.category==='soda').length,1);
 assert.equal(JSON.parse(core.readFileSync('/hunem/assets/sodas.json','utf8')).version,2,'test really hydrated legacy data');
 core.hydrate({});
});
test('compiled research uses new region aliases, sections and cache version',async()=>{
 core.hydrate({});const c=core.cities.find(c=>c.id==='it-potenza'),a={key:'fixture',p:c.p,cityId:c.id,name:c.name,kind:'city'};
 const calls=[];
 const r=await core.researchAnchor(a,{now:start,previous:{foodScanVersion:3,foodRetryAt:start+86400000,food:[]},fetcher:async url=>{
  const u=new URL(url);calls.push(u.href);
  if(!u.host.endsWith('.wikivoyage.org'))return {ok:true,json:async()=>({elements:[],query:{pages:[]}})};
  return {ok:true,json:async()=>u.searchParams.get('prop')==='sections'?{parse:{title:u.searchParams.get('page'),sections:[{index:'1',line:u.host.startsWith('it.')?'A tavola':'Eat'}]}}:{parse:{text:u.searchParams.get('page')==='Basilicata'?'<li><i>Pasta con i peperoni cruschi</i> — pasta dish with peppers.</li>':''}}};
 }});
 assert.equal(r.foodScanVersion,5);assert.equal(r.foodStatus,'ready');
 assert.ok(r.food.some(f=>f.scope==='region'&&f.dishes.some(d=>d.name==='Pasta con i peperoni cruschi')));
 assert.ok(calls.some(u=>u.includes('page=Basilicata')));
});
test('compiled engine selects checked national dishes for all nineteen countries without research cache',async()=>{
 core.hydrate({});const clock=Date.parse(day+'T10:59Z'),catalog=JSON.parse(files['/hunem/assets/local-food-references.json']);
 for(const country of new Set(core.cities.map(c=>c.country))){
  const c=core.cities.find(c=>c.country===country),s={version:1,now:clock,realAt:clock,speed:1,location:c.id,job:null,events:[],diaries:[],totalKm:0,balance:0,lastDay:day,workCycle:{resumeDay:'2026-11-01',restDays:20,deliveredDay:'2026-10-26'}};
  await core.tick(s,clock+60000,async()=>{throw Error('no real route in isolated fixture');},()=>.5);
  const paid=s.events.find(e=>e.category==='meal');assert.ok(paid?.food,country);assert.equal(paid.food.scope,'country');assert.equal(paid.food.country,country);assert.equal(paid.food.cityId,null);assert.equal(paid.food.reviewedCountryDish,true);assert.ok(catalog.recipes.some(r=>r.country===country&&r.name===paid.food.name));
  assert.equal(s.events.filter(e=>e.type==='meal_finished').length,0,'not yet completed');
 }
});
test('country dish collections merge across cities and do not rewrite city/region identities',()=>{
 const meal=(location,time,scope='country')=>({type:'meal_finished',mealId:String(time),time,location,day,food:{name:'Arancini',localDish:true,scope,country:'IT',cityId:scope==='country'?null:location,source:'https://en.wikivoyage.org/wiki/Italy#Eat'}});
 const world={publicationWorldId:'fixture',events:[meal('it-potenza',1),meal('it-palermo',2)]};
 const inventory=collectionInventory({world},'meal',3);assert.equal(inventory.length,1);assert.equal(inventory[0].count,2);assert.match(inventory[0].identity,/^country:it:/);
 world.events.push(meal('it-palermo',3,'city'));assert.equal(collectionInventory({world},'meal',4).length,2);
});

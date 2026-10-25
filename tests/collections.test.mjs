import test from 'node:test';import assert from 'node:assert/strict';
import {collectionInventory} from '../bridge/collections.mjs';
import {authorizeWorld} from '../lib/world-policy.mjs';
const meal=(id,time,extra={})=>({type:'meal_finished',mealId:id,time,day:'2026-10-25',meal:'lunch',location:'a',food:{name:'Pannfisch',localDish:true,scope:'region',region:'Schleswig-Holstein',country:'DE',source:'https://example.org/food'},...extra});
const soda=(id,time)=>({type:'expense',category:'soda',id,time,day:'2026-10-25',soda:{id:'fritz-orange',name:'fritz-limo orange',brand:'fritz-limo',flavour:'orange',source:'https://fritz-kola.com/'}});
test('meal completion and actual soda purchase are distinct facts; archived overlap, future facts, regional identity and repeated purchases deduplicate correctly',()=>{
 const events=[meal('m1',100),meal('m2',200,{location:'b'}),meal('future',500),{type:'expense',category:'meal',time:50,food:{name:'Not eaten'}},meal('plain',300,{food:{name:'午間套餐',localDish:false}}),soda('soda:day1',80),soda('soda:day2',220),{type:'soda_finished',time:400,soda:{id:'fritz-orange'}}];
 const p={world:{publicationWorldId:'w',now:400,events,publicationJobs:[{input:{events:structuredClone(events)}}]}},before=JSON.stringify(p);
 const meals=collectionInventory(p,'meal',400),local=meals.find(r=>r.localDish);assert.equal(local.count,2);assert.equal(meals.length,1);assert.equal(meals.some(r=>r.name==='午間套餐'),false);assert.deepEqual(local.occurrences.map(e=>e.time),[200,100]);
 const drinks=collectionInventory(p,'soda',400);assert.equal(drinks.length,1);assert.equal(drinks[0].count,2);assert.deepEqual(drinks[0].occurrences.map(e=>e.time),[220,80]);assert.equal(drinks[0].firstSeenAt,80);assert.equal(JSON.stringify(p),before);
 assert.throws(()=>collectionInventory(p,'bad'),/INVALID/);assert.equal(collectionInventory(p,'meal',90).length,0);
});
test('different regional recipes do not merge; purchase memory alone does not invent dated drinking or purchase history; reader cannot upload',()=>{
 const p={world:{publicationWorldId:'w',now:400,events:[meal('a',100),meal('b',200,{food:{...meal().food,region:'Other'}})],sodaLife:{tried:{x:{count:99}}}}};
 assert.equal(collectionInventory(p,'meal',400).length,2);assert.equal(collectionInventory(p,'soda',400).length,0);
 assert.equal(authorizeWorld({reader:true},'GET','/api/collections'),'reader');assert.throws(()=>authorizeWorld({reader:true},'POST','/api/collections'));assert.throws(()=>authorizeWorld(null,'GET','/api/collections'));
 assert.equal(authorizeWorld({role:'service',scopes:['publication']},'GET','/api/collections'),'service');assert.throws(()=>authorizeWorld({role:'service',scopes:['sync']},'GET','/api/collections'));
});

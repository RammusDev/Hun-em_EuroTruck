import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {placeNames} from '../bridge/place-name-catalog.mjs';
import {taiwanAliases,taiwanPlaceErrors,taiwanPlaceInstruction} from '../bridge/taiwan-place-names.mjs';
import {browserState} from '../bridge/browser-state.mjs';
import {writingPacket} from '../bridge/writing-packet.mjs';

test('all shared names match the 591-city catalog; browser labels preserve world identity',()=>{
 const catalog=JSON.parse(readFileSync('../assets/city-candidates.json'));
 for(const module of ['place-name-catalog','taiwan-place-names'])assert.equal(readFileSync(`bridge/${module}.mjs`,'utf8'),readFileSync(`../lib/${module}.mjs`,'utf8'));
 assert.equal(placeNames.cities.length,591);assert.equal(Object.keys(placeNames.countries).length,19);
 assert.deepEqual(placeNames.cities,catalog.cities.map(({id,name,localName})=>({id,name,localName})));
 for(const name of Object.values(taiwanAliases))assert.ok(placeNames.cities.some(c=>c.name===name)||Object.values(placeNames.countries).includes(name),name);
 const naples=placeNames.cities.find(c=>c.localName==='Napoli');
 const state={cities:[{id:naples.id,name:'那不勒斯',latin:'Napoli',p:[14.2,40.8],country:'IT'}],diaries:[{zh:'舊文章那不勒斯'}]};
 const before=structuredClone(state),view=browserState(state);
 assert.equal(view.cities[0].name,'拿坡里');assert.equal(view.cities[0].id,naples.id);assert.deepEqual(view.diaries,state.diaries);assert.deepEqual(state,before);
});
test('writing names are scoped to actual context and never mutate the archive',()=>{
 const input=JSON.parse(readFileSync('../data/downloads/hunem-2026-10-17-4c8c8119/input.json'));
 const naples=placeNames.cities.find(c=>c.localName==='Napoli');input.events.push({type:'visit',cityId:naples.id});
 const before=structuredClone(input),packet=writingPacket(input),rule=taiwanPlaceInstruction(input);
 assert.match(rule,/Napoli=拿坡里/);assert.ok(!rule.includes('Berlin=柏林'));assert.match(rule,/克羅埃西亞/);
 assert.ok(packet.writingInstruction.includes(rule));assert.equal(writingPacket({...input,writingInstruction:packet.writingInstruction}).writingInstruction,packet.writingInstruction);assert.deepEqual(input,before);
});
test('check Chinese narrative and explanations while preserving foreign names, examples and vocabulary terms',()=>{
 const d={title:'拿坡里',zh:'克羅埃西亞與義大利',learning:{en:{text:'Naples and Croatia',grammar:[['I visit Naples.','那不勒斯是城市。']],words:['Naples：那不勒斯','那不勒斯：專名']},de:{text:'Neapel'},ja:{text:'ナポリ'}}};
 const errors=taiwanPlaceErrors(d);assert.equal(errors.length,2);assert.ok(errors.every(e=>e.startsWith('en')));
 d.learning.en.grammar[0][1]='拿坡里是城市。';d.learning.en.words[0]='Naples：拿坡里';assert.deepEqual(taiwanPlaceErrors(d),[]);
 assert.equal(taiwanPlaceErrors({...d,title:'克羅地亞',zh:'那不勒斯'}).length,2);
});
test('Google map loader requests Taiwan Traditional Chinese independently of browser language',async()=>{
 for(const path of ['public/app.js','../public/app.js']){
  const source=readFileSync(path,'utf8'),line=source.split(/\r?\n/).find(l=>l.startsWith('async function initMap()'));
  let url;
  const context={state:{googleKey:'test-key',position:[14.2,40.8]},window:{},document:{createElement:()=>({}),head:{append(script){url=new URL(script.src);context.window.initHunEmMap();}}},$ :()=>({}),googleAvatar:()=>({}),google:{maps:{Map:class{},Marker:class{},Polyline:class{}}}};
  vm.createContext(context);await vm.runInContext(line+';initMap()',context);
  assert.equal(url.searchParams.get('language'),'zh-TW');assert.equal(url.searchParams.get('region'),'TW');
 }
});

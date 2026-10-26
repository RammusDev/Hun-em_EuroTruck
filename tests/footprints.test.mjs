import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {footprintInventory,mapFootprints} from '../bridge/footprints.mjs';
import {authorizeWorld} from '../lib/world-policy.mjs';
const visit=(time,id='church',p=[9.43,54.79])=>({type:'visit',time,location:'flensburg',place:{topicId:id,name:'Test church',p}});
test('deduplicates archive and live visits, retains exact revisit times across midnight and DST without mutating world',()=>{
 const t=Date.parse('2026-10-24T22:10Z'),a=visit(t),b=visit(t+25*3600000),future=visit(t+50*3600000,'future');
 const p={world:{publicationWorldId:'one',events:[b,{...visit(t,'generic'),place:{generic:true}},future],publicationJobs:[{input:{events:[a,b]}}],visits:{landmarks:{}}}},before=structuredClone(p);
 const rows=footprintInventory(p,t+26*3600000);assert.equal(rows.length,1);assert.deepEqual(rows[0].visits,[b.time,t]);assert.deepEqual(p,before);
 assert.notEqual(footprintInventory({...p,world:{...p.world,publicationWorldId:'two'}},t+26*3600000)[0].id,rows[0].id);
});
test('old exact-time records remain available without inventing map coordinates',()=>{
 const p={world:{publicationWorldId:'one',events:[],visits:{landmarks:{x:{id:'x',name:'Older place',firstSeenAt:10,lastSeenAt:20}}}}};
 const r=footprintInventory(p,100);assert.deepEqual(r[0].visits,[20,10]);assert.equal(r[0].p,null);assert.deepEqual(mapFootprints(r,{west:-180,east:180,south:-90,north:90}),[]);
});
test('large history map response remains bounded and supports anti-meridian',()=>{
 const rows=Array.from({length:10000},(_,i)=>({id:String(i),p:[-179+(i%200)*1.79,-80+Math.floor(i/200)*3.2],visits:[1],name:'test'}));
 const before=performance.now(),map=mapFootprints(rows,{west:-180,east:180,south:-90,north:90,zoom:18});
 assert.ok(map.length<=100);assert.equal(map.reduce((n,r)=>n+r.count,0),10000);assert.ok(performance.now()-before<3000);
 assert.equal(mapFootprints([{id:'a',p:[179,0]},{id:'b',p:[-179,0]},{id:'c',p:[0,0]}],{west:170,east:-170,south:-10,north:10}).reduce((n,r)=>n+r.count,0),2);
 assert.throws(()=>mapFootprints(rows,{west:NaN,east:1,south:0,north:1}),/INVALID_BOUNDS/);
});
test('footprint readers may read but cannot upload; service requires publication scope',()=>{
 assert.equal(authorizeWorld({reader:true},'GET','/api/footprints'),'reader');
 assert.throws(()=>authorizeWorld({reader:true},'POST','/api/footprints'));
 assert.throws(()=>authorizeWorld(null,'GET','/api/footprints'));
 assert.throws(()=>authorizeWorld({role:'service',scopes:['sync']},'POST','/api/footprints'));
 assert.equal(authorizeWorld({role:'service',scopes:['publication']},'POST','/api/footprints'),'service');
});

test('cluster identity tracks every member, is order-independent and is stable during fractional zoom',()=>{
 const rows=[{id:'a',p:[11,48]},{id:'b',p:[11,48]},{id:'c',p:[11,48]}],bounds={west:10,east:12,south:47,north:49,zoom:19};
 const a=mapFootprints(rows.slice(0,2),bounds)[0],b=mapFootprints([rows[0],rows[2]],bounds)[0];assert.notEqual(a.id,b.id);assert.equal(a.id,mapFootprints(rows.slice(0,2).reverse(),bounds)[0].id);assert.deepEqual(a.bounds,[11,48,11,48]);
 assert.deepEqual(mapFootprints(rows,{...bounds,zoom:19.2}),mapFootprints(rows,{...bounds,zoom:19.9}));
});

test('small map groups include bounded member data for same-coordinate expansion',()=>{
 const p=[15.448582,40.543694],rows=Array.from({length:13},(_,i)=>({id:String(i),name:'景點'+i,p:[...p],visits:[123],topicId:'private-metadata'})),before=structuredClone(rows),bounds={west:15,east:16,south:40,north:41,zoom:19};
 const group=mapFootprints(rows.slice(0,2),bounds)[0];assert.equal(group.members.length,2);assert.deepEqual(group.members[0].p,p);assert.equal(group.members[0].visits,undefined);assert.equal(group.members[0].topicId,undefined);
 assert.equal(mapFootprints(rows,bounds)[0].members,undefined);assert.deepEqual(rows,before);
});

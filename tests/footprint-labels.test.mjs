import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {footprintLabels} from '../bridge/footprint-labels.mjs';
import {footprintLocalities} from '../bridge/footprint-localities.mjs';

test('town qualifier moves to native locality line without changing original landmark identity',()=>{
 const p=footprintLocalities.find(p=>p.name==='St. Jürgen-Kirche (Flensburg)'),row={id:'one',name:p.name,source:p.source,cityId:'de-flensburg',p:[9,54],image:{sha256:'same'},visits:[1,2]},before=structuredClone(row),out=footprintLabels(row);
 assert.equal(out.displayName,'St. Jürgen-Kirche');assert.equal(out.locationLabel,'Flensburg-Schleswig-Holstein-Deutschland');assert.equal(out.name,row.name);assert.deepEqual(row,before);assert.deepEqual(out.p,row.p);assert.equal(out.image,row.image);assert.equal(out.visits,row.visits);
});
test('landmark locality overrides delivery anchor, preserves meaningful parentheses and never guesses missing locations',()=>{
 for(const [name,location] of [['Chiesa di San Nicola (Trentinara)','Trentinara-Campania-Italia'],['Chiesa di Santa Maria delle Grazie (Pertosa)','Pertosa-Campania-Italia'],['Pfarrkirche Wörgl','Wörgl-Tirol-Österreich'],['Kloster Breitenau','Guxhagen-Hessen-Deutschland']]){
  const p=footprintLocalities.find(p=>p.name===name),r=footprintLabels({...p,cityId:'it-potenza'});assert.equal(r.locationLabel,location);
 }
 const r=footprintLabels({name:'Museum (former church)',source:'https://example.org',cityId:'de-flensburg'});assert.equal(r.displayName,'Museum (former church)');assert.equal(r.locality,null);assert.match(r.locationLabel,/待確認/);
 const known=footprintLabels({name:'Another landmark (Flensburg)',source:'https://example.org'});assert.equal(known.displayName,'Another landmark');assert.equal(known.locationLabel,'Flensburg-Schleswig-Holstein-Deutschland');
});
test('all 23 saved landmarks have locality labels; coordinates, visits and images remain intact',()=>{
 const {items}=JSON.parse(fs.readFileSync('../data/footprint-labels-20261027/before.json')),before=structuredClone(items);
 const out=items.map(r=>footprintLabels(r));assert.equal(out.length,23);assert.ok(out.every(r=>r.locality));assert.deepEqual(items,before);
 for(let i=0;i<items.length;i++)for(const key of ['id','topicId','name','cityId','p','recordedP','visits','image'])assert.deepEqual(out[i][key],items[i][key]);
});
test('source-backed cached locality supports new landmarks without a registry entry',()=>{
 const row={topicId:'osm:way:1',name:'A new museum',source:'https://www.openstreetmap.org/way/1',cityId:'de-flensburg'},topic={id:row.topicId,source:row.source,cityId:'de-kassel',cityEvidence:{source:row.source}};
 const world={localTopicCache:{test:{landmarks:[topic]}}},before=structuredClone(world);
 assert.equal(footprintLabels(row,world).locationLabel,'Kassel-Hessen-Deutschland');assert.deepEqual(world,before);
 topic.cityEvidence.source='https://example.org';assert.equal(footprintLabels(row,world).locality,null);
});

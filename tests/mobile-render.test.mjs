import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('motion ticks update progress without rebuilding content or map geometry',()=>{
 const callback=source.match(/setInterval\(\(\)=>\{if\(motionFresh&&motion\?\.view[\s\S]*?\},1000\);/)[0];
 let updates=0;const state={};
 vm.runInNewContext(callback,{setInterval:fn=>fn(),motionFresh:true,motion:{view:()=>({progress:.5})},document:{hidden:false},performance:{now:()=>1},state,renderMotion:()=>updates++,render:()=>{throw Error('full render during motion');}});
 assert.equal(updates,1);assert.equal(state.progress,.5);
});
for(const googleMode of [true,false])test('unchanged route does not reset '+(googleMode?'Google':'Leaflet')+' path',()=>{
 const code=source.slice(source.indexOf("let paintedRoute='';"),source.indexOf('function renderMotion'));
 let paths=0;const line={setOptions(){},setPath(){paths++;},setLatLngs(){paths++;},setStyle(){}};
 const context=vm.createContext({line,googleMode});vm.runInContext(code,context);
 vm.runInContext('paintRoute([[1,2],[3,4]]);paintRoute([[1,2],[3,4]]);',context);assert.equal(paths,1);
 vm.runInContext('paintRoute([[1,2],[4,5]]);',context);assert.equal(paths,2);
});

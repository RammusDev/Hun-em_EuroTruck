import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/footprints.js',import.meta.url),'utf8').replace('window.HunemFootprints={','window.HunemFootprints={make,pinSvg,');
function setup(googleMode){
 const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{addEventListener(){}});return nodes.get(id);},createElement(){return {append(){}};}};
 const window={},google={maps:{Size:class{constructor(w,h){this.width=w;this.height=h;}},Point:class{constructor(x,y){this.x=x;this.y=y;}},SymbolPath:{CIRCLE:'circle'},Marker:class{constructor(options){Object.assign(this,options);}addListener(){}getMap(){return this.map;}setIcon(icon){this.icon=icon;}}}};
 const L={divIcon:options=>options,marker:(p,options)=>({options,addTo(){return this;},bindTooltip(){return this;},on(){}})};
 vm.runInNewContext(source,{matchMedia:()=>({matches:false,addEventListener(){}}),document,window,google,L,Intl,Date,URLSearchParams,AbortController,encodeURIComponent,setTimeout(){},clearTimeout(){},fetch:async()=>({ok:true,blob:async()=>({})}),FileReader:class{readAsDataURL(){this.result='data:image/png;base64,aGVsbG8=';this.onload();}}});
 window.HunemFootprints.init({addListener(){},getPane:()=>true,on(){}},googleMode);return window.HunemFootprints;
}
test('Google photo pin embeds the image and points to the coordinate at 20,49',async()=>{
 const x=setup(true),marker=x.make({id:'one',name:'景點',p:[11,48],count:1,image:{thumbnail:'/thumb.png'}});
 assert.equal(marker.icon.scaledSize.width,40);assert.equal(marker.icon.scaledSize.height,50);assert.equal(marker.icon.anchor.y,49);
 await new Promise(r=>setImmediate(r));assert.match(decodeURIComponent(marker.icon.url),/image\/png;base64/);assert.match(decodeURIComponent(marker.icon.url),/clip-path/);
 const cluster=x.make({id:'cluster',p:[11,48],count:3});assert.equal(cluster.icon.scale,19);assert.equal(cluster.label.text,'3');
});
test('Leaflet uses a 40 by 50 pin with the same bottom anchor',()=>{
 const m=setup(false).make({id:'one',p:[11,48],count:1,image:{thumbnail:'/thumb.png'}});
 assert.deepEqual([...m.options.icon.iconSize],[40,50]);assert.deepEqual([...m.options.icon.iconAnchor],[20,49]);assert.equal(m.options.icon.html.className,'footprint-photo-pin');
});

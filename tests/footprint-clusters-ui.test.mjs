import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/footprints.js',import.meta.url),'utf8').replace('window.HunemFootprints={','window.HunemFootprints={make,drawMap,');
function setup(g,zoom){const nodes=new Map(),requests=[],events={},moves=[];const node=()=>({children:[],append(...c){this.children.push(...c);},replaceChildren(){},setAttribute(){},addEventListener(){},showModal(){this.open=true;},focus(){}}),get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},window={};
 const map={addListener:(n,f)=>events[n]=f,on:(n,f)=>n.split(' ').forEach(k=>events[k]=f),getPane:()=>true,getZoom:()=>zoom,getMaxZoom:()=>18,get:()=>undefined,setZoom:z=>moves.push(z),setCenter(){},setView:(p,z)=>moves.push(z),getBounds:()=>g?{getSouthWest:()=>({lng:()=>10,lat:()=>47}),getNorthEast:()=>({lng:()=>12,lat:()=>49})}:{getWest:()=>10,getSouth:()=>47,getEast:()=>12,getNorth:()=>49}};
 const google={maps:{Size:class{},Point:class{},SymbolPath:{CIRCLE:1},Marker:class{constructor(o){Object.assign(this,o);this.events={};}addListener(n,f){this.events[n]=f;}setMap(){}getMap(){return this.map;}}}},L={divIcon:o=>o,marker:()=>({events:{},addTo(){return this;},bindTooltip(){return this;},on(n,f){this.events[n]=f;return this;}})};
 vm.runInNewContext(source,{window,document:{getElementById:get,createElement:node,body:{classList:{add(){},remove(){}}}},matchMedia:()=>({matches:false,setAttribute(){},addEventListener(){}}),google,L,Intl,Date,URLSearchParams,AbortController,encodeURIComponent,setTimeout(){},clearTimeout(){},fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve:d=>resolve({ok:true,json:async()=>d})}))});window.HunemFootprints.init(map,g);return{api:window.HunemFootprints,requests,events,moves,get};}
for(const g of [true,false])test((g?'Google':'Leaflet')+' overlapping high-zoom cluster opens only its area without zooming out',()=>{const x=setup(g,g?21:18),m=x.api.make({id:'cluster',count:2,p:[11,48],bounds:[10.99,47.99,11.01,48.01]});m.events.click();assert.equal(x.moves.length,0);assert.ok(x.get('footprints-dialog').open);assert.match(decodeURIComponent(x.requests[0].url),/area=10.99,47.99,11.01,48.01/);});
test('low-zoom cluster zooms in and map movement immediately invalidates pending old response',async()=>{const x=setup(true,9),m=x.api.make({id:'cluster',count:2,p:[11,48],bounds:[11,48,11,48]});m.events.click();assert.deepEqual(x.moves,[11]);const draw=x.api.drawMap();assert.equal(x.requests.length,1);x.events.bounds_changed();assert.ok(x.requests[0].options.signal.aborted);x.requests[0].resolve({total:999,points:[]});await draw;assert.notEqual(x.get('footprints-total').textContent,'999 個景點');});

for(const g of [true,false])test((g?'Google':'Leaflet')+' hidden scenery aborts pending response and skips map reads until restored',async()=>{
 const x=setup(g,12),toggle=x.get('toggle-map-footprints');
 assert.equal(toggle.textContent,'隱藏景點');
 const pending=x.api.drawMap();toggle.onclick();
 assert.equal(toggle.textContent,'顯示景點');assert.ok(x.requests[0].options.signal.aborted);
 x.requests[0].resolve({total:999,points:[]});await pending;
 assert.notEqual(x.get('footprints-total').textContent,'999 個景點');
 await x.api.drawMap();assert.equal(x.requests.length,1);
 x.events[g?'idle':'moveend']();await x.api.drawMap();assert.equal(x.requests.length,1);
 toggle.onclick();assert.equal(toggle.textContent,'隱藏景點');
 const restored=x.api.drawMap();assert.equal(x.requests.length,2);
 x.requests[1].resolve({total:3,points:[]});await restored;assert.equal(x.get('footprints-total').textContent,'3 個景點');
});

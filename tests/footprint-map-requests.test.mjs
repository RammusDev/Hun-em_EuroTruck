import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/footprints.js',import.meta.url),'utf8').replace('window.HunemFootprints={','window.HunemFootprints={make,drawMap,');
function setup(g,initialZoom=9){
 const nodes=new Map(),requests=[],events={},moves=[],fits=[],timers=new Map(),created=[];let timerId=0,zoom=initialZoom,west=10;
 const node=()=>({children:[],append(...c){this.children.push(...c);},replaceChildren(){},setAttribute(){},addEventListener(){},showModal(){this.open=true;},focus(){}}),get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},window={};
 const map={addListener:(n,f)=>events[n]=f,on:(n,f)=>n.split(' ').forEach(k=>events[k]=f),getPane:()=>true,getZoom:()=>zoom,getMaxZoom:()=>18,get:()=>undefined,setZoom:z=>{zoom=z;moves.push(z);},setCenter(){},setView:(p,z)=>{zoom=z;moves.push(z);},fitBounds:(...args)=>fits.push(args),removeLayer:m=>m.removed=true,getBounds:()=>g?{getSouthWest:()=>({lng:()=>west,lat:()=>47}),getNorthEast:()=>({lng:()=>west+2,lat:()=>49})}:{getWest:()=>west,getSouth:()=>47,getEast:()=>west+2,getNorth:()=>49}};
 const google={maps:{Size:class{},Point:class{},SymbolPath:{CIRCLE:1},Marker:class{constructor(o){Object.assign(this,o);this.events={};created.push(this);}addListener(n,f){this.events[n]=f;}setMap(m){this.map=m;}getMap(){return this.map;}}}},L={divIcon:o=>o,marker:()=>({events:{},addTo(){created.push(this);return this;},bindTooltip(){return this;},on(n,f){this.events[n]=f;return this;}})};
 vm.runInNewContext(source,{window,document:{getElementById:get,createElement:node,body:{classList:{add(){},remove(){}}}},matchMedia:()=>({matches:false,addEventListener(){}}),google,L,Intl,Date,URLSearchParams,AbortController,encodeURIComponent,setTimeout:f=>{const id=++timerId;timers.set(id,f);return id;},clearTimeout:id=>timers.delete(id),fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve:d=>resolve({ok:true,json:async()=>d})}))});window.HunemFootprints.init(map,g);
 return{api:window.HunemFootprints,requests,events,moves,fits,get,created,setWest(v){west=v;},async flush(){const jobs=[...timers.values()];timers.clear();await Promise.all(jobs.map(f=>f()));}};
}
const row={id:'one',name:'景點',count:1,p:[11,48]};const reply=(total=1,points=[row])=>({total,points});
for(const g of [true,false]){
 const name=g?'Google':'Leaflet';
 test(name+' high zoom or exact overlap opens group records without further zoom',()=>{
  for(const [zoom,bounds] of [[g?21:18,[10.99,47.99,11.01,48.01]],[9,[11,48,11,48]]]){const x=setup(g,zoom),m=x.api.make({id:'group',count:2,p:[11,48],bounds});m.events.click();assert.equal(x.moves.length,0);assert.equal(x.fits.length,0);assert.ok(x.get('footprints-dialog').open);assert.match(x.requests[0].url,/area=/);}
 });
 test(name+' separated group fits its real extent in one click',()=>{const x=setup(g),m=x.api.make({id:'group',count:2,p:[11,48],bounds:[10.99,47.99,11.01,48.01]});m.events.click();assert.equal(x.fits.length,1);assert.equal(x.moves.length,0);assert.equal(x.requests.length,0);});
 test(name+' movement storm preserves flight, rejects stale data, loads latest view once',async()=>{
  const x=setup(g),first=x.api.drawMap();
  for(let i=0;i<30;i++){x.setWest(10+i/100);x.events[g?'bounds_changed':'move']();await x.api.drawMap();}
  assert.equal(x.requests.length,1);assert.equal(x.requests[0].options.signal.aborted,false);
  x.requests[0].resolve(reply(999));await first;assert.equal(x.created.length,0);assert.notEqual(x.get('footprints-total').textContent,'999 個景點');
  const next=x.flush();assert.equal(x.requests.length,2);assert.match(x.requests[1].url,/west=10.29/);x.requests[1].resolve(reply());await next;assert.equal(x.created.length,1);
  x.events[g?'idle':'moveend']();await x.flush();assert.equal(x.requests.length,2);
 });
 test(name+' duplicate idle cannot cancel or duplicate current flight',async()=>{
  const x=setup(g),p=x.api.drawMap();for(let i=0;i<15;i++){x.events[g?'idle':'moveend']();await x.api.drawMap();}
  assert.equal(x.requests.length,1);assert.equal(x.requests[0].options.signal.aborted,false);x.requests[0].resolve(reply());await p;await x.flush();assert.equal(x.requests.length,1);assert.equal(x.created.length,1);
 });
 test(name+' hide aborts only hidden layer; stale results cannot repopulate after restore',async()=>{
  const x=setup(g),p=x.api.drawMap();x.get('toggle-map-footprints').onclick();assert.ok(x.requests[0].options.signal.aborted);await x.api.drawMap();assert.equal(x.requests.length,1);
  x.get('toggle-map-footprints').onclick();const restored=x.api.drawMap();x.requests[0].resolve(reply(999));await p;assert.equal(x.created.length,0);
  x.requests[1].resolve(reply());await restored;assert.equal(x.created.length,1);
  x.get('toggle-map-footprints').onclick();assert.ok(g?x.created[0].map===null:x.created[0].removed);
 });
}

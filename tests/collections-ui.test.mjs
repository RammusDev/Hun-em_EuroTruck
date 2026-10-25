import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../public/collections.js',import.meta.url),'utf8');
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.attributes={};this.textContent='';}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
 setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}
 addEventListener(k,v){this.listeners[k]=v;}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}focus(){this.focused=true;}
}
function setup(mobile=false){
 const ids=Object.fromEntries(['collections-dialog','collections-list','collections-status','collections-prev','collections-next','collections-title','collections-note','open-meals','open-sodas','close-collections','sodas-held','meals-total','sodas-total'].map(id=>[id,new Element()]));
 const requests=[],window={};let now=100000;
 vm.runInNewContext(script,{matchMedia:()=>({matches:mobile,addEventListener(){}}),document:{body:{classList:{add(){},remove(){}}},getElementById:id=>ids[id],createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})},window,Intl,URL,URLSearchParams,AbortController,Date:class extends Date{static now(){return now;}},fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve:data=>resolve({ok:true,json:async()=>data}),reject}))});
 return{ids,window,requests,advance:()=>{now+=60001;},open:kind=>ids['open-'+kind].onclick({currentTarget:ids['open-'+kind]})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const data=items=>({items,total:items.length,totalOccurrences:items.reduce((n,row)=>n+row.count,0),hasMore:false});
const row=(extra={})=>({name:'日常午餐',localDish:false,count:1,occurrences:[{time:1792832400000,meal:'lunch',location:'城市'}],...extra});
test('summary is throttled and held bottle updates independently',async()=>{
 const x=setup();x.window.HunemCollections.refresh();x.window.HunemCollections.refresh();assert.equal(x.requests.length,1);
 x.requests[0].resolve({meal:{total:3,totalOccurrences:4},soda:{total:2,totalOccurrences:6}});await tick();
 assert.equal(x.ids['sodas-total'].textContent,'2 款 · 購買 6 次');x.window.HunemCollections.updateHeld({name:'汽水',flavour:'薑汁'});assert.match(x.ids['sodas-held'].textContent,/目前持有：汽水/);
 x.window.HunemCollections.refresh();assert.equal(x.requests.length,1);x.advance();x.window.HunemCollections.refresh();assert.equal(x.requests.length,2);
});
test('ordinary meals keep text; soda records use purchase time; images load only in open collection',async()=>{
 const x=setup();assert.equal(x.requests.length,0);x.open('meals');x.requests[0].resolve(data([row()]));await tick();
 const ordinary=x.ids['collections-list'].children[0];assert.ok(ordinary.children.some(e=>e.textContent==='保留餐次文字紀錄'));assert.ok(!ordinary.children.some(e=>e.className==='collection-pending'));
 x.ids['close-collections'].onclick();assert.ok(x.ids['open-meals'].focused);assert.equal(x.ids['collections-list'].children.length,0);
 x.open('sodas');x.requests[1].resolve(data([row({name:'汽水',image:{src:'/original.png',thumbnail:'/thumbnail.png',width:1254,height:1254}})]));await tick();
 const soda=x.ids['collections-list'].children[0],image=soda.children.find(e=>e.tagName==='a').children[0];assert.equal(image.src,'/original.png');assert.equal(image.loading,'lazy');assert.ok(soda.children.some(e=>e.textContent==='購買 1 次 · 柏林時間'));
});
test('stale meal response cannot overwrite soda list and closing cancels rendering',async()=>{
 const x=setup();x.open('meals');x.open('sodas');assert.equal(x.requests[0].options.signal.aborted,true);x.requests[1].resolve(data([row({name:'新汽水'})]));await tick();x.requests[0].resolve(data([row({name:'舊餐點'})]));await tick();assert.equal(x.ids['collections-list'].children[0].children[0].textContent,'新汽水');
 x.ids['close-collections'].onclick();assert.equal(x.requests[1].options.signal.aborted,true);assert.equal(x.ids['collections-list'].children.length,0);
});
test('failed page offers retry without losing ability to close',async()=>{
 const x=setup();x.open('meals');x.requests[0].reject(Error('網路中斷'));await tick();assert.equal(x.ids['collections-status'].textContent,'網路中斷');x.ids['collections-list'].children[0].onclick();assert.equal(x.requests.length,2);x.ids['close-collections'].onclick();assert.ok(x.ids['open-meals'].focused);
});

test('two-page spreads use cached records and fetch across the API page boundary',async()=>{
 const x=setup();x.open('meals');x.requests[0].resolve({items:Array.from({length:12},(_,i)=>row({name:'餐點'+i})),total:14,totalOccurrences:14,hasMore:true});await tick();
 assert.equal(x.ids['collections-list'].children.length,2);
 for(let i=0;i<5;i++){x.ids['collections-next'].onclick();await tick();}
 assert.equal(x.requests.length,1);assert.equal(x.ids['collections-list'].children[0].children[0].textContent,'餐點10');
 x.ids['collections-next'].onclick();assert.match(x.requests[1].url,/page=1/);x.requests[1].resolve({items:[row({name:'餐點12'}),row({name:'餐點13'})],total:14,totalOccurrences:14,hasMore:false});await tick();
 assert.equal(x.ids['collections-next'].disabled,true);x.ids['collections-prev'].onclick();await tick();assert.equal(x.requests.length,2);assert.equal(x.ids['collections-list'].children[0].children[0].textContent,'餐點10');
});
test('city IDs become display names; unknown IDs are omitted and soda sources stay safe',async()=>{
 const x=setup();x.window.HunemCollections.updateCities([{id:'at-kufstein',name:'庫夫施泰因'}]);x.open('sodas');
 x.requests[0].resolve(data([row({name:'汽水',source:'https://example.com/product',occurrences:[{time:1792832400000,location:'at-kufstein'},{time:1792832400000,location:'de-unknown'}]}),row({source:'javascript:alert(1)'})]));await tick();
 const card=x.ids['collections-list'].children[0],history=card.children.find(e=>e.tagName==='details');assert.match(history.children[1].children[1].textContent,/庫夫施泰因/);assert.doesNotMatch(history.children[2].children[1].textContent,/de-unknown/);assert.equal(card.children.find(e=>e.tagName==='a').textContent,'產品資料來源 ↗');assert.ok(!x.ids['collections-list'].children[1].children.some(e=>e.tagName==='a'));
});

for(const mobile of [false,true])test('soda catalogue shows four per page on '+(mobile?'mobile':'desktop'),async()=>{const x=setup(mobile);x.open('sodas');x.requests[0].resolve({items:Array.from({length:12},(_,i)=>row({name:'汽水'+i})),total:14,totalOccurrences:14});await tick();assert.equal(x.ids['collections-list'].children.length,4);assert.equal(x.ids['collections-dialog'].attributes['data-kind'],'soda');for(let i=0;i<3;i++){x.ids['collections-next'].onclick();await tick();}assert.match(x.requests[1].url,/page=1/);x.requests[1].resolve({items:[row({name:'汽水12'}),row({name:'汽水13'})],total:14,totalOccurrences:14});await tick();assert.equal(x.ids['collections-list'].children.length,2);assert.equal(x.ids['collections-next'].disabled,true);});

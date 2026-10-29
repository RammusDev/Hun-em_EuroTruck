import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('shared notebook preparation never waits for an image decoder or starts a timer',()=>{
 const window={},image={decode(){throw Error('must not block on decoding');}},node={querySelectorAll:()=>[image]};
 vm.runInNewContext(fs.readFileSync(new URL('../public/dialog-paging.js',import.meta.url),'utf8'),{window});
 assert.equal(window.HunemDialogPaging.prepare([node]),undefined);assert.equal(image.loading,'eager');assert.equal(image.decoding,'async');
 assert.equal(window.HunemDialogPaging.source('/generated/day/art.png'),'/generated/day/art.png?view=book');
 assert.equal(window.HunemDialogPaging.source('/footprints/id/hash.jpg'),'/footprints/id/hash.jpg');
 assert.equal(window.HunemDialogPaging.source('https://example.org/art.png'),'https://example.org/art.png');
});
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.classList={add(){},remove(){}};}
 append(...c){this.children.push(...c);}replaceChildren(...c){this.children=c;}addEventListener(k,v){this.listeners[k]=v;}
 setAttribute(){}removeAttribute(){}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}focus(){this.focused=true;}
 cloneNode(){return new Element();}remove(){}getAnimations(){return [];}animate(){return {finished:Promise.resolve()};}
 querySelector(){return this;}querySelectorAll(){return this.children.flatMap(c=>c.tagName==='img'?[c]:c.querySelectorAll?.()||[]);}
}
test('album turns and closes even if image downloads never finish',async()=>{
 const ids=new Map(),get=id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id);},window={HunemDialogPaging:{source:s=>s+'?view=book'}};
 vm.runInNewContext(fs.readFileSync(new URL('../public/album.js',import.meta.url),'utf8'),{
  window,document:{getElementById:get,createElement:tag=>new Element(tag),body:{classList:{add(){},remove(){}}}},
  matchMedia:()=>({matches:false,addEventListener(){}}),Intl,Image:class{constructor(){throw Error('must not preload and wait for originals');}}
 });
 window.HunemAlbum.update(Array.from({length:4},(_,i)=>({id:String(i),src:'/generated/day/'+i+'.png',drawnOn:'2026-10-28',country:'IT',city:'Palermo',name:'Fixture',alt:'Fixture'})));
 await get('open-album').onclick({currentTarget:get('open-album')});
 await get('album-next').onclick();assert.match(get('album-counter').textContent,/第 2 \/ 2 頁/);
 assert.equal(get('album-spread').querySelectorAll('img')[0].src,'/generated/day/2.png?view=book');
 await get('close-album').onclick();assert.equal(get('album-dialog').open,false);assert.equal(get('open-album').focused,true);
});

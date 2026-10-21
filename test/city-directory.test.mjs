import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function fixture(){
 class Node{}
 class Element extends Node{constructor(){super();this.open=false;this.dataset={};this.listeners={};this.classList={contains:n=>this.kind===n};}addEventListener(n,f){this.listeners[n]=f;}contains(n){return n===this||n?.inside;}querySelector(){return trigger;}closest(selector){return selector==='summary'?this.summary:null;}}
 const root=new Element(),country=new Element(),trigger=new Element(),summary=new Element();
 root.open=true;country.kind='city-country';summary.parentElement=country;summary.inside=true;summary.summary=summary;
 trigger.parentElement=root;trigger.summary=trigger;trigger.inside=true;trigger.focus=()=>{trigger.focused=true;};
 const listeners={},document={querySelector:()=>root,addEventListener:(n,f)=>listeners[n]=f};
 vm.runInNewContext(fs.readFileSync(new URL('../public/city-directory.js',import.meta.url),'utf8'),{document,Node,Element});
 const click=target=>{const e={target,preventDefault(){this.defaultPrevented=true;}};root.listeners.click(e);listeners.click(e);return e;};
 return {root,country,summary,trigger,listeners,click,Element};
}
test('nested country clicks toggle one row exactly once and preserve the outer directory',()=>{
 const f=fixture(),label=new f.Element();label.summary=f.summary;label.inside=true;
 for(let i=0;i<24;i++){const event=f.click(i%2?f.summary:label);assert.equal(event.defaultPrevented,true);assert.equal(f.country.open,i%2===0);assert.equal(f.root.open,true);}
});
test('close button and Escape close long lists and return focus; outside click also dismisses',()=>{
 const f=fixture(),button=new f.Element();button.inside=true;button.closest=s=>s==='[data-close-city-directory]'?button:null;
 f.click(button);assert.equal(f.root.open,false);assert.equal(f.trigger.focused,true);
 f.click(f.trigger);assert.equal(f.root.open,true);
 f.listeners.keydown({key:'Escape',preventDefault(){}});assert.equal(f.root.open,false);
 f.click(f.trigger);f.listeners.click({target:new f.Element()});assert.equal(f.root.open,false);
});

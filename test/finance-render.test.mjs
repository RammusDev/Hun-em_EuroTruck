import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('clock ticks retain finance image nodes; changed balances redraw',()=>{
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function renderFinance(){'),source.indexOf('\nconst time=',source.indexOf('function renderFinance(){')));
 const node=()=>({children:[],replaceChildren(){this.children=[];this.clears=(this.clears||0)+1;},append(...items){this.children.push(...items);},prepend(item){this.children.unshift(item);},setAttribute(){}});
 const summary=node(),ledger=node(),state={finance:{cashCents:10000,fuelLiters:50,entries:[]},heldSoda:{name:'檸檬汽水'}};
 const ctx=vm.createContext({state,$:id=>id==='finance-summary'?summary:ledger,document:{createElement:node}});
 vm.runInContext(fn+';renderFinance();',ctx);
 const image=summary.children[0].children[0];
 for(let i=0;i<10;i++){state.now=i;vm.runInContext('renderFinance()',ctx);}
 assert.equal(summary.clears,1);assert.equal(ledger.clears,1);assert.equal(summary.children[0].children[0],image);
 state.finance.cashCents=20000;vm.runInContext('renderFinance()',ctx);
 assert.equal(summary.clears,2);assert.equal(summary.children[0].children[2].textContent,'€200.00');
});

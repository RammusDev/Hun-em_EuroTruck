// Isolated workshop UI fixture. Never connects to the production world.
import {createServer} from 'node:http';import {readFileSync} from 'node:fs';import {build} from 'esbuild';
import {settingsView,previewSetting,saveSetting,diagnosticBundle} from '../lib/maintenance.mjs';
const p={files:{},world:{publicationWorldId:'isolated-preview',diaries:[]}},versions=new Map();
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Panel from './app/maintenance-panel.tsx';createRoot(document.getElementById('root')).render(<div className='access-shell access-admin'><main className='access-main'><h1>雲端維護 · 隔離展示</h1><Panel/></main></div>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic'});
const css=readFileSync('public/access.css','utf8')+'\n'+readFileSync('app/globals.css','utf8').split('/* Owner cloud workshop */')[1];
createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:5187');res.setHeader('Cache-Control','no-store');
 if(u.pathname==='/mobile'){res.setHeader('Content-Type','text/html');return res.end('<iframe title="mobile" src="/" style="width:390px;height:844px;border:0"></iframe>');}
 if(u.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle.outputFiles[0].text);}
 if(u.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
 if(u.pathname==='/api/maintenance'){
  res.setHeader('Content-Type','application/json');let result;
  if(req.method==='POST'){
   const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));
   if(body.op==='restore')body.text=versions.get(body.kind+':'+body.hash);
   result=body.op==='preview'?previewSetting(p,body):await saveSetting(p,{...body,action:body.op},{backup:async(k,h,t)=>versions.set(k+':'+h,t),write:(f,t)=>p.files[f]=t});
  }else result=u.searchParams.get('op')==='version'?{text:versions.get(u.searchParams.get('kind')+':'+u.searchParams.get('hash'))}:u.searchParams.get('op')==='debug'?diagnosticBundle(p,{},null):settingsView(p);
  return res.end(JSON.stringify(result));
 }
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script></html>');
 }catch(e){res.statusCode=e.status||400;res.end(JSON.stringify({error:e.message}));}
}).listen(5187,'127.0.0.1',()=>console.log('Isolated preview http://127.0.0.1:5187'));

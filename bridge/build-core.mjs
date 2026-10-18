import {readFileSync,writeFileSync,readdirSync,mkdirSync,copyFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),{build}=require('esbuild'),root=path.resolve('..');
const files={};for(const dir of ['assets','assets/economy'])for(const f of readdirSync(path.join(root,dir)))if(f.endsWith('.json'))files['/hunem/'+dir+'/'+f]=readFileSync(path.join(root,dir,f),'utf8');
for(const f of ['CHARACTER.md','DAILY_WRITING.md'])files['/hunem/'+f]=readFileSync(path.join(root,f),'utf8');
writeFileSync('bridge/static-files.json',JSON.stringify(files));
await build({entryPoints:['bridge/core-entry.mjs'],outfile:'lib/core.mjs',bundle:true,platform:'node',format:'esm',target:'es2022',define:{'import.meta.url':JSON.stringify('file:///hunem/lib/core.mjs')},alias:{'node:fs':path.resolve('bridge/fs.mjs'),'node:url':path.resolve('bridge/url.mjs')},nodePaths:[path.join(root,'node_modules')],external:['node:crypto','node:path'],logLevel:'warning'});
for(const f of readdirSync(path.join(root,'public')).filter(f=>/\.(js|css|html)$/.test(f)))copyFileSync(path.join(root,'public',f),path.join('public',f));
await build({entryPoints:[path.join(root,'lib/zhuyin.mjs')],outfile:'public/zhuyin-client.js',bundle:true,platform:'browser',format:'iife',globalName:'HunemZhuyin',target:'es2022',minify:true,define:{'import.meta.url':'location.href'},alias:{'node:fs':path.resolve('bridge/zhuyin-fs.mjs')},nodePaths:[path.join(root,'node_modules')],logLevel:'warning'});
// The pronunciation bundle is deliberately absent from the initial script list.
console.log('Original engine bundled with virtual filesystem; static UI copied.');

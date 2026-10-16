import path from 'node:path';
import {fileURLToPath} from 'node:url';
import initial from './static-files.json' with {type:'json'};
const files=new Map(Object.entries(initial)),dirty=new Set();
const key=f=>path.posix.normalize(f instanceof URL?fileURLToPath(f):String(f).replaceAll('\\','/'));
export function hydrate(values){files.clear();for(const [k,v]of Object.entries(initial))files.set(k,v);for(const [k,v]of Object.entries(values))files.set(key(k),v);dirty.clear();}
export function changes(){return Object.fromEntries([...dirty].map(k=>[k,files.get(k)]));}
export function readFileSync(f,enc){const k=key(f);if(!files.has(k))throw Object.assign(Error('No virtual file '+k),{code:'ENOENT'});const b=Buffer.from(files.get(k),'utf8');return enc?b.toString():b;}
export function writeFileSync(f,value){const k=key(f);files.set(k,Buffer.isBuffer(value)?value.toString():String(value));dirty.add(k);}
export function renameSync(from,to){writeFileSync(to,readFileSync(from,'utf8'));files.delete(key(from));dirty.delete(key(from));}
export function mkdirSync(){}
export function existsSync(f){const k=key(f);return files.has(k)||[...files.keys()].some(p=>p.startsWith(k+'/'));}
export function realpathSync(f){return key(f);}
export function readdirSync(f){const k=key(f).replace(/\/$/,'')+'/';return [...new Set([...files.keys()].filter(p=>p.startsWith(k)).map(p=>p.slice(k.length).split('/')[0]))];}
export function statSync(f){return {size:Buffer.byteLength(readFileSync(f,'utf8')),isFile:()=>true,isDirectory:()=>false};}
export function appendFileSync(f,v){writeFileSync(f,(existsSync(f)?readFileSync(f,'utf8'):'')+v);}

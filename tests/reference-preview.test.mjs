import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import png from 'pngjs';
import jpeg from 'jpeg-js';
import sharp from 'sharp';
import {makeReferencePreview,cachedReferencePreview,previewPolicy} from '../bridge/reference-preview.mjs';

test('real recent artwork becomes bounded JPEG without changing source bytes or corrupting pixels',async()=>{
 for(const day of ['2026-10-19','2026-10-20']){
  const source=readFileSync(`../data/album-variety-20261021/${day}-square.png`),copy=Buffer.from(source),p=makeReferencePreview(source),decoded=jpeg.decode(p.bytes);
  assert.equal(decoded.width,512);assert.equal(decoded.height,512);assert.ok(p.bytes.length<previewPolicy.maxBytes);assert.ok(p.bytes.length<source.length/10);assert.deepEqual(source,copy);
  const expected=await sharp(source).resize(512,512).removeAlpha().raw().toBuffer();let error=0;
  for(let i=0;i<512*512;i++)for(let c=0;c<3;c++)error+=Math.abs(decoded.data[i*4+c]-expected[i*3+c]);
  assert.ok(error/expected.length<14,'decoded preview must retain the actual source composition and colors');
 }
});
test('preview preserves aspect ratio and composites transparent pixels onto white',()=>{
 const source=png.PNG.sync.write({width:256,height:128,data:Buffer.alloc(256*128*4)}),p=makeReferencePreview(source),d=jpeg.decode(p.bytes);
 assert.equal(d.width,256);assert.equal(d.height,128);assert.ok(d.data[0]>250&&d.data[1]>250&&d.data[2]>250);
});
test('derived cache reuses identical bytes, invalidates on changed source, and rejects bad PNG',async()=>{
 const values=new Map();let puts=0;const storage={get:async key=>values.has(key)?{arrayBuffer:async()=>values.get(key)}:null,put:async(key,data)=>{puts++;values.set(key,Buffer.from(data));}};
 const first=readFileSync('../data/album-variety-20261021/2026-10-19-square.png'),second=readFileSync('../data/album-variety-20261021/2026-10-20-square.png');
 const a=await cachedReferencePreview(first,storage),b=await cachedReferencePreview(first,storage),c=await cachedReferencePreview(second,storage);
 assert.equal(a.cacheHit,false);assert.equal(b.cacheHit,true);assert.deepEqual(a.bytes,b.bytes);assert.notEqual(a.key,c.key);assert.equal(puts,2);
 assert.throws(()=>makeReferencePreview(Buffer.from('not a PNG')),/INVALID_PNG/);
});

import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateFileUrl,pngReceipt,readPlatformPng,fileProbeTool} from '../bridge/mcp-file.mjs';
const png=readFileSync('D:/Work/Hum-em_EuroTruck/public/illustrations/munich.png');
test('file descriptor matches platform schema and rejects external / insecure URLs',()=>{
 assert.deepEqual(fileProbeTool._meta['openai/fileParams'],['file']);
 for(const u of ['http://files.oaiusercontent.com/x','https://localhost/x','https://example.org/x','https://user:pw@files.oaiusercontent.com/x'])assert.throws(()=>validateFileUrl({file_id:'test',download_url:u}));
 assert.ok(validateFileUrl({file_id:'test',download_url:'https://files.oaiusercontent.com/x'}));
});
test('PNG transfer validates complete chunks, dimensions and bounded HTTPS stream',async()=>{
 const receipt=pngReceipt(png);assert.ok(receipt.width>=128);assert.throws(()=>pngReceipt(png.subarray(0,40)));
 const r=await readPlatformPng({file_id:'test',download_url:'https://files.oaiusercontent.com/x'},async(u,options)=>{assert.equal(options.redirect,'error');return new Response(png);});assert.equal(r.receipt.sha256,receipt.sha256);
 await assert.rejects(readPlatformPng({file_id:'test',download_url:'https://files.oaiusercontent.com/x'},async()=>new Response('',{headers:{'content-length':String(9*1024*1024)}})),/TOO_LARGE/);
});

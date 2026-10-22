import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {writingPacket} from '../bridge/writing-packet.mjs';
import {dailyCoverageInstruction} from '../bridge/writing-coverage.mjs';

test('whole-day and single-scene rules reach writing packets without mutating archives or duplicating policy',()=>{
 const input=JSON.parse(readFileSync('../data/downloads/hunem-2026-10-17-4c8c8119/input.json'));
 const original=structuredClone(input),p=writingPacket(input);
 assert.ok(p.writingInstruction.includes(dailyCoverageInstruction));assert.match(p.writingInstruction,/上午、下午、晚間/);assert.match(p.writingInstruction,/仍只畫一張/);
 assert.deepEqual(input,original);assert.deepEqual(p.events.map(e=>e.type),input.events.map(e=>e.type));assert.equal(p.imageRequests.length,input.imageRequests.length);
 const newer={...input,writingInstruction:p.writingInstruction};assert.equal(writingPacket(newer).writingInstruction,p.writingInstruction);
});

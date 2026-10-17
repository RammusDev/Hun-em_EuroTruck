import {committed,binaryHash} from '../../lib/runtime';
import {writingPacket} from '../../bridge/writing-packet.mjs';
import {pilotRpc} from '../../bridge/mcp-pilot.mjs';
import {fileProbeTool,readPlatformPng} from '../../bridge/mcp-file.mjs';
import {publicationTools} from '../../bridge/mcp-publication-tools.mjs';
import {mcpPublicationHandlers} from '../../lib/mcp-publication';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(Number(req.headers.get('content-length')||0)>131072)return new Response('Request too large',{status:413});
 let message;try{const text=await req.text();if(text.length>131072)return new Response('Request too large',{status:413});message=JSON.parse(text);}catch{return Response.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},{status:400});}
 const result=await pilotRpc(message,{
  identity:req.headers.get('oai-authenticated-user-id'),
  extraTools:[fileProbeTool,...publicationTools],
  handlers:mcpPublicationHandlers(req.headers.get('oai-authenticated-user-id')||''),
  fileProbe:async(args:any)=>{const {receipt}=await readPlatformPng(args.file);return {...receipt,nonce:args.nonce??null,mutated:false};},
  readStatus:async(args:any)=>{const p=await committed();const latest=p.world.diaries.at(-1);return {pilot:'hunem-readonly-mcp-v1',publicationApiVersion:3,publicationTools:publicationTools.map(t=>t.name),nonce:args.nonce??null,worldId:p.world.publicationWorldId,worldTime:p.world.now,diaries:p.world.diaries.length,latestDay:latest?.day,mutated:false};},
  readPacket:async(args:any)=>{const p=await committed();const job=p.world.publicationJobs.filter((j:any)=>j.status==='published'&&j.input&&(!args.day||j.day===args.day)).sort((a:any,b:any)=>b.day.localeCompare(a.day))[0];if(!job)throw Error('No published packet');const packet=writingPacket(job.input);return {pilot:'hunem-readonly-mcp-v1',nonce:args.nonce??null,id:job.id,day:job.day,eventCount:packet.events.length,inputSha256:binaryHash(JSON.stringify(job.input,null,2)),packetSha256:binaryHash(JSON.stringify(packet)),packetBytes:Buffer.byteLength(JSON.stringify(packet)),learning:Object.fromEntries(Object.entries(packet.learningPlan).map(([l,v]:[string,any])=>[l,{level:v.level,grammarIds:v.grammarIds}])),...(args.includePacket?{packet}:{}),mutated:false};}
 });
 return result===null?new Response(null,{status:202}):Response.json(result,{headers:{'Cache-Control':'no-store'}});
}

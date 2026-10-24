import {committed,binaryHash,engine} from '../../lib/runtime';
import {journeyStatus} from '../../bridge/journey-status.mjs';
import {writingPacket} from '../../bridge/writing-packet.mjs';
import {publicationMetrics} from '../../bridge/publication-metrics.mjs';
import {pilotRpc} from '../../bridge/mcp-pilot.mjs';
import {fileProbeTool,readPlatformPng} from '../../bridge/mcp-file.mjs';
import {publicationTools} from '../../bridge/mcp-publication-tools.mjs';
import {mcpPublicationHandlers} from '../../lib/mcp-publication';
import {platformOwner,platformBootstrap,serviceTicket} from '../../lib/world-auth';
import {env} from 'cloudflare:workers';
import {readMonitor} from '../../lib/monitor-store.mjs';
import {footprintQueue,saveFootprint,claimFootprint} from '../../lib/footprints';
import {footprintTools} from '../../bridge/footprint-tools.mjs';
import {footprintEvents} from '../../lib/footprint-events';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(Number(req.headers.get('content-length')||0)>131072)return new Response('Request too large',{status:413});
 let message;try{const text=await req.text();if(text.length>131072)return new Response('Request too large',{status:413});message=JSON.parse(text);}catch{return Response.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},{status:400});}
 const bootstrap=platformBootstrap(req,message);
 if((message.method==='tools/call'||message.method?.startsWith('events/'))&&!platformOwner(req)&&!bootstrap)return Response.json({jsonrpc:'2.0',id:message.id??null,error:{code:-32001,message:'Pinned platform owner required'}},{status:403,headers:{'Cache-Control':'no-store'}});
 if(message.method==='server/discover')return Response.json({jsonrpc:'2.0',id:message.id??null,result:{resultType:'complete',supportedVersions:['2026-07-28'],capabilities:{tools:{},events:{}}}});
 if(message.method?.startsWith('events/')){
  try{const p=await committed();return Response.json({jsonrpc:'2.0',id:message.id??null,result:await footprintEvents().rpc(message.method,message.params,req.headers.get('oai-authenticated-user-id')||'',p.world.publicationWorldId)},{headers:{'Cache-Control':'no-store'}});}
  catch(e:any){return Response.json({jsonrpc:'2.0',id:message.id??null,error:{code:e.rpcCode||-32602,message:'Footprint event operation failed',...(e.reason?{data:{reason:e.reason}}:{})}},{headers:{'Cache-Control':'no-store'}});}
 }
 const result=await pilotRpc(message,{
  identity:req.headers.get('oai-authenticated-user-id'),
  extraTools:[fileProbeTool,...publicationTools,...footprintTools,{name:'hunem_service_ticket',description:'Issue a five-minute, site-bound sync/publication/reference ticket to the pinned platform owner only.',inputSchema:{type:'object',properties:{},additionalProperties:false}}],
  handlers:{...mcpPublicationHandlers(req.headers.get('oai-authenticated-user-id')||''),hunem_service_ticket:()=>serviceTicket(req),hunem_footprint_queue:()=>footprintQueue(),hunem_claim_footprint:(a:any)=>claimFootprint(a.id),hunem_footprint_event_status:()=>footprintEvents().status(),hunem_retry_footprint_event:async(a:any)=>footprintEvents().replay(await committed(),a.id,a.requestId),hunem_receive_footprint:async(a:any)=>{if(typeof a.lease!=='string')throw Error('FOOTPRINT_CLAIM_REQUIRED');const {bytes}=await readPlatformPng(a.file);return saveFootprint(a.id,bytes,a.review,a.lease);}},
  fileProbe:async(args:any)=>{const {receipt}=await readPlatformPng(args.file);return {...receipt,nonce:args.nonce??null,mutated:false};},
  readStatus:async(args:any)=>{const p=await committed();const latest=p.world.diaries.at(-1);const view=p.eventArchitecture?engine.projectPlan(p,Date.now()):engine.snapshot(structuredClone(p.world));let monitor=null;if(!bootstrap){const r=await readMonitor(p,{...view,cities:engine.cities},env);monitor={checkedAt:r.checkedAt,health:r.health,activity:r.activity,clock:r.clock,publication:r.publication,issues:r.issues,emailEnabled:r.emailEnabled,lastBackgroundCheck:r.lastBackgroundCheck,limits:r.limits};}return {pilot:'hunem-readonly-mcp-v1',publicationApiVersion:3,publicationTools:publicationTools.map(t=>t.name),nonce:args.nonce??null,worldId:p.world.publicationWorldId,worldTime:p.world.now,diaries:p.world.diaries.length,latestDay:latest?.day,...journeyStatus(p,view),...(p.eventArchitecture?{eventArchitecture:true,planVersion:p.eventPlan?.version,plannedThrough:p.eventPlan?.until,displayTime:view.now,nextEvents:p.eventPlan?.events.slice(0,6)}:{}),...(bootstrap?{platformOwnerId:req.headers.get('oai-authenticated-user-id')}:{platformOwnerPinned:platformOwner(req)}),monitor,mutated:false};},
  readPacket:async(args:any)=>{const p=await committed();const job=p.world.publicationJobs.filter((j:any)=>j.status==='published'&&j.input&&(!args.day||j.day===args.day)).sort((a:any,b:any)=>b.day.localeCompare(a.day))[0];if(!job)throw Error('No published packet');const packet=writingPacket(job.input);return {pilot:'hunem-readonly-mcp-v1',nonce:args.nonce??null,id:job.id,day:job.day,eventCount:packet.events.length,inputSha256:binaryHash(JSON.stringify(job.input,null,2)),packetSha256:binaryHash(JSON.stringify(packet)),packetBytes:Buffer.byteLength(JSON.stringify(packet)),metrics:publicationMetrics(p,job),learning:Object.fromEntries(Object.entries(packet.learningPlan).map(([l,v]:[string,any])=>[l,{level:v.level,grammarIds:v.grammarIds}])),...(args.includePacket?{packet}:{}),mutated:false};}
 });
 return result===null?new Response(null,{status:202}):Response.json(result,{headers:{'Cache-Control':'no-store'}});
}

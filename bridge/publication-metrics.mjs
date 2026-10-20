import {publicationFlowVersion} from './writing-packet.mjs';
const unknownTokens=()=>({status:'unavailable',source:'native-platform-usage-not-exposed',input:null,cachedInput:null,cacheWriteInput:null,output:null,reasoningOutput:null,total:null});
export function ensureMetrics(p,job,now){
 p.cloudMetrics??={};const m=p.cloudMetrics[job.id]??={startedAt:now,requests:0,validationFailures:0,stages:{}};
 m.observationVersion=1;m.flowVersion??=publicationFlowVersion;m.day=job.day;m.operations??=[];m.tokenUsage??=unknownTokens();m.imageTokenUsage??=unknownTokens();return m;
}
export function observeOperation(p,job,op,result,{at,serverElapsedMs}){
 const m=ensureMetrics(p,job,at),outcome=result?.valid===false?'validation-failed':result?.recorded?'failure-recorded':'ok';
 m.operationCount=(m.operationCount||0)+1;
 m.operations.push({op,at,serverElapsedMs,outcome,...(result?.fields?{fields:result.fields}:{})});
 if(m.operations.length>128){m.operations.shift();m.droppedOperationEvents=(m.droppedOperationEvents||0)+1;}
 if(op==='claim'&&result?.action==='generate')m.claimedAt??=at;
 if(op==='write'&&result?.written)m.writingReadyAt??=Date.parse(p.cloudWriting?.[job.id]?.record.authoredAt)||at;
 if(op==='attach'&&result?.attached)m.imageReadyAt??=at;
 if(op==='publish'&&result?.published)m.publishedAt??=at;
 if(op==='fail')m.lastFailureAt=at;
 return m;
}
const interval=(from,to)=>Number.isFinite(from)&&Number.isFinite(to)?Math.max(0,to-from):null;
export function publicationMetrics(p,job){
 const m=p.cloudMetrics?.[job.id],d=p.world.diaries.find(d=>d.publication?.id===job.id);
 if(!m)return {observationVersion:1,day:job.day,id:job.id,status:'not-recorded',tokenUsage:unknownTokens(),imageTokenUsage:unknownTokens()};
 const record=p.cloudWriting?.[job.id]?.record,manualRecovery=!!d?.publication?.recoveryId;
 const writing=m.writingReadyAt??m.stages?.write??(!record?.manualRecovery?Date.parse(record?.authoredAt):undefined),image=m.imageReadyAt??m.stages?.attach,published=m.publishedAt??m.finishedAt??(!manualRecovery&&d?.publication?.writing==='ai'?Date.parse(d.publication.publishedAt):undefined),start=m.claimedAt??m.startedAt;
 return {...m,id:job.id,day:job.day,observationVersion:m.observationVersion||0,flowVersion:m.flowVersion||'legacy-unversioned',status:manualRecovery?'manually-recovered':d?.publication?.writing==='template-fallback'?'template-fallback':d?'published':job.status,tokenUsage:m.tokenUsage||unknownTokens(),imageTokenUsage:m.imageTokenUsage||unknownTokens(),phaseTiming:{basis:'original scheduled-run wall-clock stage intervals; excludes later manual recovery; includes model/tool/wait time',writingMs:interval(start,writing),illustrationMs:interval(writing,image),publishingMs:interval(image,published),totalMs:interval(start,published),fallbackPublishedAt:d?.publication?.writing==='template-fallback'?d.publication.publishedAt:null},sizeUnit:'UTF-8 bytes; never token counts'};
}

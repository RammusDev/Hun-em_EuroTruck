import {env} from 'cloudflare:workers';
import {committed,transaction,engine,putObject,getObject,binaryHash} from './runtime';
import {publication} from './publication';
import {readPlatformPng} from '../bridge/mcp-file.mjs';
import {candidateView,illustrationFormatInstruction} from '../bridge/writing-packet.mjs';
import {publicationMetrics} from '../bridge/publication-metrics.mjs';
type Session={owner:string;mode:'pilot'|'live';jobId:string;lease:string;day:string;expiresAt:number;payload?:any;now?:number;keyPrefix?:string};
const db=()=>env.DB as D1Database,bucket=()=>env.BUCKET as R2Bucket;
function sessionId(id:any){if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('INVALID_SESSION');return id;}
async function create(s:Session){const id=crypto.randomUUID(),key='mcp-sessions/'+id+'/0.json';await bucket().put(key,JSON.stringify(s));await db().prepare('INSERT INTO hunem_runtime(id,value,revision,updated_at) VALUES(?,?,?,?)').bind('mcp:'+id,JSON.stringify({key}),0,Date.now()).run();return id;}
async function load(id:string,owner:string){sessionId(id);const row=await db().prepare('SELECT value FROM hunem_runtime WHERE id=?').bind('mcp:'+id).first<any>();if(!row)throw Error('SESSION_NOT_FOUND');const obj=await bucket().get(JSON.parse(row.value).key);if(!obj)throw Error('SESSION_NOT_FOUND');const s=await obj.json<Session>();if(s.owner!==owner)throw Error('SESSION_OWNER_MISMATCH');if(Date.now()>s.expiresAt)throw Error('SESSION_EXPIRED');return s;}
async function locked(id:string,owner:string,fn:(s:Session)=>Promise<any>){
 const lease=crypto.randomUUID(),now=Date.now();const row=await db().prepare('UPDATE hunem_runtime SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR lease_until<?) RETURNING *').bind(lease,now+180000,'mcp:'+sessionId(id),now).first<any>();if(!row)throw Error('SESSION_BUSY');
 try{const s=await load(id,owner),result=await fn(s),key=`mcp-sessions/${id}/${row.revision+1}.json`;await bucket().put(key,JSON.stringify(s));const r=await db().prepare('UPDATE hunem_runtime SET value=?,revision=?,updated_at=?,lease=NULL,lease_until=NULL WHERE id=? AND revision=? AND lease=? AND lease_until>=?').bind(JSON.stringify({key}),row.revision+1,Date.now(),'mcp:'+id,row.revision,lease,Date.now()).run();if(r.meta.changes!==1)throw Error('SESSION_COMMIT_CONFLICT');return result;}finally{await db().prepare('UPDATE hunem_runtime SET lease=NULL,lease_until=NULL WHERE id=? AND lease=?').bind('mcp:'+id,lease).run();}
}
async function perform(s:Session,op:string,args:any={}){
 if(s.mode==='pilot')return publication(s.payload,op,{...args,id:s.jobId,lease:s.lease},{now:s.now,keyPrefix:s.keyPrefix,noFiles:true});
 return transaction(p=>publication(p,op,{...args,id:s.jobId,lease:s.lease}));
}
function assertObject(x:any){if(!x||typeof x!=='object'||Array.isArray(x))throw Error('INVALID_ARGUMENTS');}
export function mcpPublicationHandlers(owner:string){return {
 hunem_prepare_publication:async(a:any)=>{
  if(!['pilot','live'].includes(a.mode))throw Error('INVALID_MODE');
  let s:Session,c:any;
  if(a.mode==='pilot'){
   const current=await committed();const source=current.world.publicationJobs.filter((j:any)=>j.status==='published'&&j.input&&(!a.sourceDay||j.day===a.sourceDay)).sort((a:any,b:any)=>b.day.localeCompare(a.day))[0];if(!source)throw Error('PUBLISHED_FIXTURE_REQUIRED');
   const job=structuredClone(source),id=crypto.randomUUID();job.id=`hunem-${job.day}-${id.slice(0,8)}`;job.input.id=job.id;job.status='pending';job.error=null;delete job.publishedAt;delete job.imageOutcome;
   const payload={world:{now:current.world.now,publicationJobs:[job],diaries:[],publicationWindow:{opensAt:0}},files:{}};
   s={owner,mode:'pilot',jobId:job.id,day:job.day,lease:'',expiresAt:Date.now()+45*60000,payload,now:engine.publicationDeadline(job)-15*60000,keyPrefix:'archive/mcp-pilot/'+id};
   c=await publication(payload,'claim',{}, {now:s.now,noFiles:true,keyPrefix:s.keyPrefix});
  }else{
   c=await transaction(async p=>{if(Date.now()-p.world.realAt>60000)return {action:'sync-pending'};return publication(p,'claim',{resume:a.resume===true});});
   if(c.action!=='generate')return c;
   s={owner,mode:'live',jobId:c.id,day:c.input.day,lease:'',expiresAt:Date.now()+35*60000};
  }
  if(c.action!=='generate')return c;s.lease=c.lease;const id=await create(s);delete c.lease;return {...c,session:id,scope:s.mode,formalWorldModified:s.mode==='live'};
 },
 hunem_submit_writing:async(a:any)=>{if(!['validate','write'].includes(a.action))throw Error('INVALID_ACTION');for(const k of ['draft','patch','review'])if(a[k]!==undefined)assertObject(a[k]);return locked(a.session,owner,s=>perform(s,a.action,{draft:a.draft,patch:a.patch,review:a.review}));},
 hunem_receive_illustration:async(a:any)=>{
  const initial=await load(a.session,owner);assertObject(a.review);
  const {bytes,receipt}=await readPlatformPng(a.file);
  if(bytes.readUInt32BE(16)!==bytes.readUInt32BE(20))throw Error('IMAGE_FORMAT_REQUIRED: use a square 1:1 PNG matching the first album artwork; generate again without padding or cropping.');
  return locked(a.session,owner,async s=>{
   if(s.mode!==initial.mode)throw Error('SESSION_CONFLICT');
   const key=s.keyPrefix?s.keyPrefix+'/daily-sketch.png':`generated/${s.jobId}/daily-sketch.png`;
   const review={...a.review,sha256:receipt.sha256};
   const payload=s.mode==='pilot'?s.payload:await committed();const job=payload.world.publicationJobs.find((j:any)=>j.id===s.jobId);if(!job||!payload.cloudWriting?.[s.jobId])throw Error('WRITING_REQUIRED');
   if(review.tool!=='image_gen.imagegen'||review.actuallyCalled!==true||!review.originalGeneratedPath||!review.visualReview?.blackFur||!review.visualReview?.yellowScarf||!review.visualReview?.newComposition)throw Error('IMAGE_REVIEW_REQUIRED');
   review.inputSha256=binaryHash(JSON.stringify(job.input,null,2));await putObject(key,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);
   const attached=await perform(s,'attach',{key,review});return {...attached,bytes:receipt.bytes,scope:s.mode};
  });
 },
 hunem_publish_journal:async(a:any)=>locked(a.session,owner,s=>perform(s,'publish')),
 hunem_publication_progress:async(a:any)=>{
  const s=await load(a.session,owner),p=s.mode==='pilot'?s.payload:await committed(),job=p.world.publicationJobs.find((j:any)=>j.id===s.jobId),writing=p.cloudWriting?.[s.jobId],image=p.cloudImages?.[s.jobId],candidate=p.cloudCandidates?.[s.jobId];
  const result:any={scope:s.mode,id:s.jobId,day:s.day,status:job?.status,writingReady:!!writing,imageReady:!!image,published:p.world.diaries.some((d:any)=>d.publication?.id===s.jobId),metrics:job?publicationMetrics(p,job):null,formalWorldModified:false};
  if(image){const object=await getObject(image.key);if(!object)throw Error('IMAGE_MISSING');result.imageSha256=binaryHash(Buffer.from(await object.arrayBuffer()));if(result.imageSha256!==image.sha256)throw Error('IMAGE_HASH_MISMATCH');}
  if(a.includeContent){if(writing)result.writing=candidateView(writing.draft);else if(candidate)result.candidate={draft:candidateView(candidate.draft),review:candidate.review};}
  return result;
 },
 hunem_reference_art:async(a:any)=>{await load(a.session,owner);const obj=await getObject('illustrations/hunem-reference-v2.png');if(!obj)throw Error('REFERENCE_MISSING');return {content:[{type:'text',text:illustrationFormatInstruction+'\nApproved Hun-em identity reference v2: entirely black fur, golden eyes, yellow scarf with a small blue/ivory diamond shield and gold crown embroidered near the end. Preserve proportions and watercolor style. Change pose and composition to match the completed diary; no required soda or phone. Never reuse the reference as a daily illustration.'},{type:'image',mimeType:'image/png',data:Buffer.from(await obj.arrayBuffer()).toString('base64')}],isError:false};},
 hunem_finish_without_image:async()=>{const p=await committed(),day=engine.realDay(Date.now()),job=p.world.publicationJobs.find((j:any)=>j.day===day);if(job&&Date.now()<engine.publicationDeadline(job))throw Error('CUTOFF_NOT_REACHED');return transaction(q=>publication(q,'verify',{}));},
 hunem_record_publication_failure:async(a:any)=>{if(typeof a.error!=='string'||a.error.length>500)throw Error('INVALID_ERROR');return locked(a.session,owner,s=>perform(s,'fail',{error:a.error,blocked:!!a.blocked}));}
};}

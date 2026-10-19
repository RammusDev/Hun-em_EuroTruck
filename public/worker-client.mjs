// Standalone Node >=22. Site credential and publication lease stay in memory.
import fs from 'node:fs/promises';
import path from 'node:path';
const ORIGIN='https://hun-em-europe.honeygrass8.chatgpt.site';
let token,serviceTicket,claim,buffer='',chain=Promise.resolve();
const metrics={commands:0,failures:0,httpAttempts:0,retries:0,elapsedMs:0};
const folder=path.resolve('hunem-work');await fs.mkdir(folder,{recursive:true});
const emit=x=>console.log(JSON.stringify(x));
async function request(route,{body,binary=false}={}){
 if(!route.startsWith('/')||route.startsWith('//')||route.includes('\\'))throw Error('INVALID_PATH');
 for(let attempt=0;attempt<3;attempt++){
  metrics.httpAttempts++;if(attempt)metrics.retries++;
  let r;try{r=await fetch(ORIGIN+route,{method:body===undefined?'GET':'POST',headers:{'OAI-Sites-Authorization':'Bearer '+token,'Cookie':'__Host-hunem_service='+serviceTicket,...(body===undefined?{}:{'Content-Type':binary?'image/png':'application/json'})},body:body===undefined?undefined:binary?body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});}catch{if(body!==undefined||attempt===2)throw Error('NETWORK_FAILURE; read status before repeating a write');await new Promise(r=>setTimeout(r,500*(attempt+1)));continue;}
  if(r.status===401||r.status===403)throw Error('SITE_AUTH_'+r.status+'; check platform credential and owner-issued service ticket; renew expired ticket with authorize; stop if repeated');
  if(body===undefined&&[409,429,502,503,504].includes(r.status)&&attempt<2){await new Promise(r=>setTimeout(r,500*(attempt+1)));continue;}
  if(!r.ok)throw Error('SITE_HTTP_'+r.status);
  return binary&&body===undefined?Buffer.from(await r.arrayBuffer()):await r.json();
 }
}
const pub=(op,extra={})=>request('/api/publication',{body:{op,id:claim?.id,lease:claim?.lease,...extra}});
async function execute(c){
 const start=Date.now();
 if(c.token){token=c.token;if(c.serviceTicket)serviceTicket=c.serviceTicket;emit({ready:true,serviceAuthorized:!!serviceTicket});return;}
 if(c.cmd==='authorize'&&c.serviceTicket){serviceTicket=c.serviceTicket;emit({serviceAuthorized:true});return;}
 if(!token)throw Error('AUTH_MISSING');
 if(!serviceTicket)throw Error('SERVICE_TICKET_REQUIRED; obtain hunem_service_ticket from pinned owner MCP');
 if(c.cmd==='stop'){process.exit(0);}
 metrics.commands++;
 let r;
 if(c.cmd==='health')r=await request('/api/health');
 else if(c.cmd==='verify'&&c.day)r=await pub('verify',{day:c.day});
 else if(c.cmd==='sync'||c.cmd==='verify')r=await request('/api/worker');
 else if(c.cmd==='claim'){
  claim=await pub('claim',{resume:c.resume===true});
  if(claim.action!=='generate'){emit(claim);return;}
  await fs.writeFile(path.join(folder,'input.json'),JSON.stringify(claim.input));
  if(claim.writing)await fs.writeFile(path.join(folder,'writing.json'),JSON.stringify(claim.writing));
  if(claim.candidate)await fs.writeFile(path.join(folder,'candidate.json'),JSON.stringify(claim.candidate));
  r={action:claim.action,id:claim.id,inputFile:path.join(folder,'input.json'),writingFile:claim.writing?path.join(folder,'writing.json'):null,candidateFile:claim.candidate?path.join(folder,'candidate.json'):null,imageReady:!!claim.image};
 }else if(['validate','write','patch'].includes(c.cmd)){
  if(!claim?.lease)throw Error('CLAIM_REQUIRED');
  const x=JSON.parse(await fs.readFile(path.resolve(c.file),'utf8'));
  r=await pub(c.cmd==='patch'?'validate':c.cmd,x);
 }else if(c.cmd==='download'){
  if(!/^\/(illustrations|generated)\/[a-zA-Z0-9/_-]+\.png$/.test(c.path))throw Error('INVALID_IMAGE_PATH');
  const bytes=await request(c.path,{binary:true});await fs.writeFile(path.resolve(c.file),bytes);r={downloaded:true,file:c.file,bytes:bytes.length};
 }else if(c.cmd==='upload'){
  if(!claim?.lease)throw Error('CLAIM_REQUIRED');
  const bytes=await fs.readFile(path.resolve(c.file));r=await request('/api/object?key='+encodeURIComponent('generated/'+claim.id+'/daily-sketch.png'),{body:bytes,binary:true});
 }else if(c.cmd==='attach'){
  const review=JSON.parse(await fs.readFile(path.resolve(c.file),'utf8'));review.inputSha256=claim.inputSha256;r=await pub('attach',{key:'generated/'+claim.id+'/daily-sketch.png',review});
 }else if(c.cmd==='publish')r=await pub('publish');
 else if(c.cmd==='fail')r=await pub('fail',{error:c.error,blocked:!!c.blocked});
 else throw Error('UNKNOWN_COMMAND');
 metrics.elapsedMs+=Date.now()-start;await fs.writeFile(path.join(folder,'metrics.json'),JSON.stringify(metrics));
 emit({...r,clientElapsedMs:Date.now()-start,transport:{httpAttempts:metrics.httpAttempts,retries:metrics.retries}});
}
// Raw mode avoids terminal echo and canonical-line truncation of JSON credentials.
if(!process.stdin.isTTY)throw Error('TTY_REQUIRED; launch with tty:true');
process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');
emit({waitingForCredential:true,protocol:'JSON object per command; no credentials in argv or files'});
process.stdin.on('data',chunk=>{
 if(chunk.includes('\u0003'))process.exit(0);
 buffer+=chunk;let c;try{c=JSON.parse(buffer.trim());}catch{return;}buffer='';
 chain=chain.then(()=>execute(c)).catch(async e=>{metrics.failures++;await fs.writeFile(path.join(folder,'metrics.json'),JSON.stringify(metrics));emit({error:String(e.message).replaceAll(token||'__NO_TOKEN__','[redacted]')});});
});

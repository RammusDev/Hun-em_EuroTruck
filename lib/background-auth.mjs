// Independent, sync-only machine identity. Never reuse owner or MCP credentials.
const encoder=new TextEncoder();
const fail=(message,status=401)=>Object.assign(new Error(message),{status});
const hex=bytes=>[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
async function signingKey(secret){
 if(typeof secret!=='string'||secret.length<43)throw fail('Background updates are not configured',503);
 return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function message(url,timestamp,body){
 const digest=hex(await crypto.subtle.digest('SHA-256',encoder.encode(body)));
 return encoder.encode(['hunem-background-v1','POST',url.origin,url.pathname,timestamp,digest].join('\n'));
}
export async function signBackground(endpoint,secret,worldId,{now=Date.now(),requestId=crypto.randomUUID()}={}){
 const url=new URL(endpoint);if(url.protocol!=='https:'||url.pathname!=='/api/background-tick'||url.search||url.hash||url.username||url.password)throw fail('Invalid background endpoint',400);
 const body=JSON.stringify({worldId,requestId}),timestamp=String(now);
 const signature=hex(await crypto.subtle.sign('HMAC',await signingKey(secret),await message(url,timestamp,body)));
 return new Request(url,{method:'POST',redirect:'manual',headers:{'content-type':'application/json','x-hunem-tick-time':timestamp,'x-hunem-tick-signature':signature},body});
}
async function boundedBody(req){
 if(Number(req.headers.get('content-length'))>512)throw fail('Request too large',413);
 const reader=req.body?.getReader();if(!reader)throw fail('Invalid request',400);
 let bytes=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>512){await reader.cancel();throw fail('Request too large',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder('utf-8',{fatal:true}).decode(all);
}
export async function verifyBackground(req,config,now=Date.now()){
 const key=await signingKey(config.BACKGROUND_TICK_SECRET),url=new URL(req.url);
 if(req.method!=='POST'||url.pathname!=='/api/background-tick'||url.search)throw fail('Background method or path denied',403);
 if(req.headers.get('content-type')!=='application/json')throw fail('Content type denied',415);
 if(!config.BACKGROUND_TICK_WORLD_ID||config.BACKGROUND_TICK_ORIGIN!==url.origin)throw fail('Background updates are not configured',503);
 const timestamp=req.headers.get('x-hunem-tick-time')||'',signature=req.headers.get('x-hunem-tick-signature')||'';
 if(!/^\d{13}$/.test(timestamp)||Math.abs(now-Number(timestamp))>60000||!/^[a-f0-9]{64}$/.test(signature))throw fail('Invalid background signature');
 const body=await boundedBody(req),valid=await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),v=>parseInt(v,16)),await message(url,timestamp,body));
 if(!valid)throw fail('Invalid background signature');
 let args;try{args=JSON.parse(body);}catch{throw fail('Invalid background request',400);}
 if(!args||Array.isArray(args)||Object.keys(args).sort().join(',')!=='requestId,worldId'||args.worldId!==config.BACKGROUND_TICK_WORLD_ID||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(args.requestId||''))throw fail('Background scope denied',403);
 return args;
}

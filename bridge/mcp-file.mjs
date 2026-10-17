import {createHash} from 'node:crypto';
export const fileSchema={type:'object',properties:{download_url:{type:'string'},file_id:{type:'string'},mime_type:{type:'string'},file_name:{type:'string'}},required:['download_url','file_id'],additionalProperties:false};
export const fileProbeTool={name:'hunem_test_file_transfer',description:'Test native file-parameter delivery of a PNG. Returns only hash and dimensions; never publishes or changes the world.',inputSchema:{type:'object',properties:{file:fileSchema,nonce:{type:'string',maxLength:64}},required:['file'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true},_meta:{'openai/fileParams':['file']}};
export function validateFileUrl(file){
 if(!file||typeof file.file_id!=='string'||!file.file_id.trim())throw Error('FILE_REFERENCE_REQUIRED');
 const u=new URL(file.download_url);
 if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname==='files.oaiusercontent.com'||u.hostname.endsWith('.oaiusercontent.com')||u.hostname.endsWith('.blob.core.windows.net')))throw Error('UNSUPPORTED_FILE_DOWNLOAD_HOST');
 if(file.mime_type&&file.mime_type!=='image/png')throw Error('PNG_REQUIRED');
 return u;
}
export function pngReceipt(bytes){
 if(bytes.length<45||bytes.length>8*1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('INVALID_PNG');
 let pos=8,width,height,data=false,end=false;
 while(pos+12<=bytes.length){const n=bytes.readUInt32BE(pos),type=bytes.subarray(pos+4,pos+8).toString();if(pos+n+12>bytes.length)throw Error('TRUNCATED_PNG');
  if(pos===8){if(type!=='IHDR'||n!==13)throw Error('INVALID_IHDR');width=bytes.readUInt32BE(pos+8);height=bytes.readUInt32BE(pos+12);if(width<128||height<128||width>4096||height>4096)throw Error('INVALID_DIMENSIONS');}
  if(type==='IDAT')data=true;pos+=n+12;if(type==='IEND'){if(n!==0||pos!==bytes.length)throw Error('INVALID_PNG_END');end=true;break;}}
 if(!data||!end)throw Error('INCOMPLETE_PNG');
 return {bytes:bytes.length,width,height,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function readPlatformPng(file,fetcher=fetch){
 const url=validateFileUrl(file);const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('FILE_DOWNLOAD_FAILED');if(Number(r.headers.get('content-length')||0)>8*1024*1024)throw Error('FILE_TOO_LARGE');
 const reader=r.body?.getReader();if(!reader)throw Error('EMPTY_FILE');const chunks=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>8*1024*1024)throw Error('FILE_TOO_LARGE');chunks.push(Buffer.from(value));}}catch(e){await reader.cancel();throw e;}
 const bytes=Buffer.concat(chunks);return {bytes,receipt:pngReceipt(bytes)};
}

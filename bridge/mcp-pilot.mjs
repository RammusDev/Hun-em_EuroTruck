// No writers, no clock advance, no bearer-token fallback. MCP calls require a
// platform-authenticated identity. Publication workers remain unchanged.
export const pilotTools=[
 {name:'hunem_status',description:'Read-only Hun-em cloud status. Does not advance the world or modify data.',inputSchema:{type:'object',properties:{nonce:{type:'string',maxLength:64}},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
 {name:'hunem_read_writing_packet',description:'Read the newest published journal writing packet, or a compact receipt by default. No unpublished jobs or mutations.',inputSchema:{type:'object',properties:{day:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},includePacket:{type:'boolean',default:false},nonce:{type:'string',maxLength:64}},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}}
];
export async function pilotRpc(message,{identity,readStatus,readPacket,fileProbe,extraTools=/** @type {any[]} */([]),handlers={}}){
 const reply=result=>({jsonrpc:'2.0',id:message?.id??null,result});
 const error=(code,text)=>({jsonrpc:'2.0',id:message?.id??null,error:{code,message:text}});
 if(message?.jsonrpc!=='2.0'||typeof message.method!=='string')return error(-32600,'Invalid JSON-RPC request');
 if(message.method==='server/discover')return reply({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(message.method==='initialize')return reply({protocolVersion:message.params?.protocolVersion||'2026-07-28',serverInfo:{name:'hunem-readonly-pilot',version:'0.1.0'},capabilities:{tools:{}}});
 if(message.method==='notifications/initialized')return null;
 if(message.method==='tools/list')return reply({tools:[...pilotTools,...extraTools]});
 if(message.method!=='tools/call')return error(-32601,'Method not found');
 if(!identity)return error(-32001,'Platform-authenticated MCP identity required');
 const name=message.params?.name,args=message.params?.arguments||{};
 if(Object.hasOwn(handlers,name)){try{const value=await handlers[name](args);return reply(value?.content?value:{content:[{type:'text',text:JSON.stringify(value)}],isError:false});}catch(e){return reply({content:[{type:'text',text:/^[A-Z_]{1,80}$/.test(e.message)?e.message:'MCP_OPERATION_FAILED'}],isError:true});}}
 if(name==='hunem_test_file_transfer'&&fileProbe){try{return reply({content:[{type:'text',text:JSON.stringify(await fileProbe(args))}],isError:false});}catch(e){return reply({content:[{type:'text',text:String(e.message)}],isError:true});}}
 if(!pilotTools.some(t=>t.name===name))return error(-32602,'Unknown read-only tool');
 if(typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['nonce',...(name==='hunem_read_writing_packet'?['day','includePacket']:[])].includes(k))||args.nonce!==undefined&&(typeof args.nonce!=='string'||args.nonce.length>64)||args.day!==undefined&&(typeof args.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(args.day))||args.includePacket!==undefined&&typeof args.includePacket!=='boolean')return error(-32602,'Invalid arguments');
 try{const value=await(name==='hunem_status'?readStatus(args):readPacket(args));return reply({content:[{type:'text',text:JSON.stringify(value)}],isError:false});}
 catch{return reply({content:[{type:'text',text:'Read-only snapshot unavailable; no data changed.'}],isError:true});}
}

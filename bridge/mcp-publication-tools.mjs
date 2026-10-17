import {fileSchema} from './mcp-file.mjs';
const session={type:'string',pattern:'^[a-f0-9-]{36}$'};
const write={readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:true};
const tool=(name,description,properties,required,annotations=write)=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations});
export const publicationTools=[
 tool('hunem_prepare_publication','Prepare daily publication via native platform authentication. mode=pilot creates an isolated copy, never a formal diary. mode=live claims only the real current daily job.',{mode:{type:'string',enum:['pilot','live']},resume:{type:'boolean'},sourceDay:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'}},['mode']),
 tool('hunem_submit_writing','Validate, patch, or finalize four-language writing. Stored candidates and completed writing survive retries. Only patch failed fields. No image generation.',{session,action:{type:'string',enum:['validate','write']},draft:{type:'object',additionalProperties:true},patch:{type:'object',additionalProperties:true},review:{type:'object',additionalProperties:true}},['session','action']),
 {...tool('hunem_receive_illustration','Receive a newly generated original PNG through native file parameters, validate and attach it to the claimed job. Requires real imagegen and visual review. Pilot sessions remain isolated.',{session,file:fileSchema,review:{type:'object',additionalProperties:true}},['session','file','review'],{...write,openWorldHint:true}),_meta:{'openai/fileParams':['file']}},
 tool('hunem_publish_journal','Atomically publish the claimed article and verified new illustration. A pilot session publishes only its isolated copy; never a formal diary.',{session},['session']),
 tool('hunem_publication_progress','Read saved candidate, writing and image status. includeContent=true returns saved writing for continuation; otherwise a compact receipt.',{session,includeContent:{type:'boolean'}},['session'],{readOnlyHint:true,destructiveHint:false,openWorldHint:false}),
 tool('hunem_reference_art','Return the established black cat / yellow scarf reference as an image content block. No credentials or download script needed.',{session},['session'],{readOnlyHint:true,destructiveHint:false,openWorldHint:false}),
 tool('hunem_finish_without_image','After the real 23:30 deadline only, apply the original fallback and return a compact receipt. Never starts writing or image generation.',{},[],write),
 tool('hunem_record_publication_failure','Record a bounded failure without rewriting valid completed work. Used before cutoff, with blocked=true for unavailable tools.',{session,error:{type:'string',maxLength:500},blocked:{type:'boolean'}},['session','error'],write)
];

import {fileSchema} from './mcp-file.mjs';
const session={type:'string',pattern:'^[a-f0-9-]{36}$'};
const write={readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:true};
const obj=properties=>({type:'object',properties,additionalProperties:false});
const text={type:'string'},strings={type:'array',items:text};
const lesson=obj({text,grammar:{type:'array',items:{type:'array',items:text}},grammarIds:strings,words:{type:'array',items:{type:'string',description:'One exact article term, a colon, then Traditional Chinese meaning. Example: truck：卡車. Do not use | or ｜.',pattern:'^.+[：:].+$'}}});
const content=obj({title:text,zh:text,learning:obj({en:lesson,de:lesson,ja:lesson})});
const review=obj({...Object.fromEntries(['firstPerson','characterVoice','factsConsistent','translationsConsistent','levelChecked','grammarExplained','recentDiariesCompared','grammarUsageChecked','vocabularyChecked'].map(k=>[k,{type:'boolean'}])),focus:text,eventIndices:{type:'array',items:{type:'integer'}},sourceKeys:strings});
const imageReview=obj({tool:text,actuallyCalled:{type:'boolean'},originalGeneratedPath:text,visualReview:obj({blackFur:{type:'boolean'},yellowScarf:{type:'boolean'},newComposition:{type:'boolean'}})});
const tool=(name,description,properties,required,annotations=write)=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations});
export const publicationTools=[
 tool('hunem_prepare_publication','Prepare daily publication via native platform authentication. mode=pilot creates an isolated copy, never a formal diary. mode=live claims only the real current daily job.',{mode:{type:'string',enum:['pilot','live']},resume:{type:'boolean'},sourceDay:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'}},['mode'],{...write,idempotentHint:false}),
 tool('hunem_submit_writing','After self-review, call action=write directly: it validates and saves atomically. On valid=false patch only failed fields and retry write. No separate validate needed. Words use term：繁中意思, never a pipe. Saved writing survives retries. No image generation.',{session,action:{type:'string',enum:['validate','write']},draft:content,patch:content,review},['session','action']),
 {...tool('hunem_receive_illustration','Receive a newly generated original PNG through native file parameters, validate and attach it to the claimed job. Requires real imagegen and visual review. Pilot sessions remain isolated.',{session,file:fileSchema,review:imageReview},['session','file','review'],{...write,openWorldHint:true}),_meta:{'openai/fileParams':['file']}},
 tool('hunem_publish_journal','Atomically publish the claimed article and verified new illustration. A pilot session publishes only its isolated copy; never a formal diary.',{session},['session']),
 tool('hunem_publication_progress','Read saved candidate, writing and image status. includeContent=true returns saved writing for continuation; otherwise a compact receipt.',{session,includeContent:{type:'boolean'}},['session'],{readOnlyHint:true,destructiveHint:false,openWorldHint:false}),
 tool('hunem_reference_art','Return the established black cat / yellow scarf reference as an image content block. No credentials or download script needed.',{session},['session'],{readOnlyHint:true,destructiveHint:false,openWorldHint:false}),
 tool('hunem_finish_without_image','After the real 23:30 deadline only, apply the original fallback and return a compact receipt. Never starts writing or image generation.',{},[],write),
 tool('hunem_record_publication_failure','Record a bounded failure without rewriting valid completed work. Used before cutoff, with blocked=true for unavailable tools.',{session,error:{type:'string',maxLength:500},blocked:{type:'boolean'}},['session','error'],write)
];

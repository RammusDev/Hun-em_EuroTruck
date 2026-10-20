// Same image provenance checks as normal publication, plus a binding to the recovered text.
export async function validateRecoveryImage(image,{engine,job,requestId,contentSha256,imageStore}){
 const fail=m=>{throw Object.assign(new Error(m),{status:409});};
 if(!image||!imageStore)fail('Recovery requires a newly generated illustration');
 if(image.key!==`generated/${job.id}/recovery-${requestId}.png`)fail('Recovery image path mismatch');
 const r=image.review;
 if(!image.name?.trim()||r?.tool!=='image_gen.imagegen'||r.actuallyCalled!==true||!r.originalGeneratedPath||!r.prompt||!r.referenceFiles?.length||r.visualReview?.blackFur!==true||r.visualReview?.yellowScarf!==true||r.visualReview?.newComposition!==true)fail('Recovery image generation and visual review required');
 if(r.inputSha256!==engine.digest(JSON.stringify(job.input,null,2))||r.writingContentSha256!==contentSha256)fail('Recovery illustration is not bound to the archived input and completed article');
 const object=await imageStore.get(image.key);if(!object)fail('Recovery image upload missing');
 const bytes=Buffer.from(await object.arrayBuffer());
 // Hash bytes directly, matching the normal generated-object index.
 const digest=imageStore.hash(bytes);
 if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)<128||bytes.readUInt32BE(20)<128)fail('Recovery illustration must be a complete PNG');
 if(digest!==image.sha256||digest!==r.sha256)fail('Recovery image hash mismatch');
 if(await imageStore.otherHash(digest,image.key))fail('Existing artwork cannot be reused as a new recovery drawing');
 return {key:image.key,sha256:digest,review:r,name:image.name};
}

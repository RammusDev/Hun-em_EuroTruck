import {transaction,getObject,engine,Conflict} from './runtime';
import {env} from 'cloudflare:workers';
const minute=60000,root='/hunem/data';
export async function publication(p:any,op:string,x:any){
 const now=Date.now(),today=engine.realDay(now),job=p.world.publicationJobs?.find((j:any)=>j.status!=='published'&&j.day===today);
 if(!job)return {action:p.world.diaries.some((d:any)=>d.day===today)?'already-published':'no-work',day:today};
 if(op==='status')return {action:'pending',id:job.id,status:job.status};
 const folder=engine.publicationFolder(root,job.id);p.cloudClaims??={};
 const old=p.cloudClaims[job.id],deadline=engine.publicationDeadline(job),window=p.world.publicationWindow;
 if(op==='claim'){
  if(now>=deadline)return {action:'closed'};if(now<(window?.opensAt||0))return {action:'not-open'};
  if(old?.expiresAt>now)return {action:'busy',id:job.id};
  if((old?.attempt||0)>=3)return {action:'blocked',id:job.id};
  const claim={token:crypto.randomUUID(),expiresAt:deadline,attempt:(old?.attempt||0)+1};p.cloudClaims[job.id]=claim;job.status='generating';
  engine.writeFileSync(folder+'/claim.json',JSON.stringify({expiresAt:deadline,attempt:claim.attempt}));
  return {action:'generate',id:job.id,lease:claim.token,input:job.input,draft:job.draft,writing:p.cloudWriting?.[job.id]||null,image:p.cloudImages?.[job.id]||null};
 }
 if(!old||old.token!==x.lease||old.expiresAt<=now||x.id!==job.id)throw new Conflict('無效或過期的發布領取權');
 if(op==='write'){
  const draft=structuredClone(job.draft);draft.title=x.draft.title;draft.zh=x.draft.zh;
  for(const lang of ['en','de','ja'])draft.learning[lang]={...draft.learning[lang],text:x.draft.learning?.[lang]?.text,grammar:x.draft.learning?.[lang]?.grammar,grammarIds:x.draft.learning?.[lang]?.grammarIds,words:x.draft.learning?.[lang]?.words};
  const errors=engine.validateDailyWriting(job.input,draft,x.review);if(errors.length)throw Error(errors.join('\n'));
  const record={mode:engine.writingMode,authoredAt:new Date(now).toISOString(),characterRevision:job.input.characterRevision,inputSha256:engine.digest(JSON.stringify(job.input,null,2)),contentSha256:engine.digest(engine.writingContent(draft)),review:x.review};
  p.cloudWriting??={};const previous=p.cloudWriting[job.id];if(previous&&previous.record.contentSha256!==record.contentSha256)throw new Conflict('已完成AI文章不可重寫');
  const written=previous||{draft,record};p.cloudWriting[job.id]=written;
  engine.writeFileSync(folder+'/writing.json',JSON.stringify(written.record));engine.writeFileSync(folder+'/draft.json',JSON.stringify(written.draft));return {written:true,sha256:written.record.contentSha256};
 }
 if(op==='attach'){
  if(!p.cloudWriting?.[job.id])throw Error('必須先完成AI寫作');
  const key=`generated/${job.id}/daily-sketch.png`;if(x.key!==key)throw Error('圖片路徑與工作不符');
  const obj=await getObject(key);if(!obj)throw Error('新圖片尚未上傳');const bytes=Buffer.from(await obj.arrayBuffer()),hash=engine.digest(bytes);
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)<128||bytes.readUInt32BE(20)<128)throw Error('圖片必須是完整PNG');
  const prior=await (env.DB as D1Database).prepare('SELECT path FROM hunem_objects WHERE sha256=? AND path<>?').bind(hash,key).first();if(prior)throw Error('不能重用既有圖片');
  const review=x.review;if(review?.tool!=='image_gen.imagegen'||review.actuallyCalled!==true||!review.originalGeneratedPath||review.visualReview?.blackFur!==true||review.visualReview?.yellowScarf!==true||review.visualReview?.newComposition!==true||review.sha256!==hash||review.inputSha256!==engine.digest(JSON.stringify(job.input,null,2)))throw Error('缺少真實生圖及角色／新構圖檢查');
  p.cloudImages??={};p.cloudImages[job.id]={key,sha256:hash,review};return {attached:true,sha256:hash};
 }
 if(op==='publish'){
  const writing=p.cloudWriting?.[job.id],image=p.cloudImages?.[job.id];if(!writing||!image||!await getObject(image.key))throw Error('文章與圖片尚未齊備');
  if(p.world.diaries.some((d:any)=>d.day===job.day))throw new Conflict('當日日記已發布');
  const d=structuredClone(writing.draft),r=job.input.imageRequests[0];d.publication={id:job.id,publishedAt:new Date(now).toISOString(),writing:'ai',fingerprint:engine.digest(writing.record.contentSha256+image.sha256)};
  d.narrative={...d.narrative,source:'ai',focus:writing.record.review.focus};d.illustrations=[{id:job.id+':daily-sketch',cityId:r.cityId,src:'/'+image.key,name:r.place,alt:'Hun-em 的'+r.place+'手繪旅行速寫',caption:r.place,drawnOn:job.day,drawnAt:job.createdAt,generatedAt:d.publication.publishedAt}];
  d.notice+=' 本篇圖文由雲端Codex與內建imagegen完成後一起發布。';p.world.diaries.push(d);p.world.diaries.sort((a:any,b:any)=>a.day.localeCompare(b.day));job.status='published';job.imageOutcome='generated';job.publishedAt=d.publication.publishedAt;job.error=null;engine.syncTeaching(p.world.diaries);return {published:true,id:job.id,day:job.day,fingerprint:d.publication.fingerprint};
 }
 if(op==='fail'){job.error=String(x.error||'工具執行失敗').slice(0,500);job.status=x.blocked?'blocked':'retry_wait';old.expiresAt=0;old.attempt=x.blocked?3:old.attempt;return {recorded:true};}
 throw Error('未知發布操作');
}

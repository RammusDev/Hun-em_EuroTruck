// Explicit manual maintenance, never called by the daily scheduler.
import {mergeCandidate} from '../bridge/writing-packet.mjs';
import {validateRecoveryImage} from './recovery-image.mjs';
import {illustrationRedraw} from './illustration-redraw.mjs';
const teachingFile='/hunem/assets/language-learning.json',languages=['en','de','ja'];
const fail=m=>{throw Object.assign(new Error(m),{status:409});};
function target(p,a,engine,now){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(a.day||'')||a.day>=engine.realDay(now))fail('Recovery requires a past date');
 if(!a.expectedWorldId||p.world.publicationWorldId!==a.expectedWorldId)fail('Recovery world mismatch');
 const jobs=p.world.publicationJobs.filter(j=>j.day===a.day),diaries=p.world.diaries.filter(d=>d.day===a.day);
 if(jobs.length!==1||diaries.length!==1)fail('Recovery requires one archived job and one diary');
 const job=jobs[0],diary=diaries[0];
 if(job.status!=='published'||diary.publication?.id!==job.id||job.input?.day!==a.day)fail('Recovery archive mismatch');
 return {job,diary,inputSha256:engine.digest(JSON.stringify(job.input,null,2)),diarySha256:engine.digest(diary)};
}
function eligible(t,p,engine){
 if(t.diary.illustrations?.length)fail('A journal with an illustration cannot be recovered again');
 if(t.diary.publication.writing==='template-fallback')return false;
 const writing=p.cloudWriting?.[t.job.id];
 if(t.diary.publication.writing==='ai'&&writing?.record.contentSha256===engine.digest(engine.writingContent(t.diary)))return true;
 fail('Recovery requires a fallback or a verified imageless AI article');
}
function expected(t,a){
 if(t.inputSha256!==a.expectedInputSha256||t.diarySha256!==a.expectedDiarySha256)fail('Recovery input or diary changed; prepare again');
}
function teachingView(config,job){return Object.fromEntries(languages.map(l=>[l,job.input.learningPlan[l].grammarIds.map(id=>{
 const g=config.languages[l].grammar.find(g=>g.id===id);if(!g)fail('Archived grammar is missing from current curriculum');
 return {id,teaching:structuredClone(g.teaching||{})};
})]));}
export async function journalRecovery(p,a,{engine,backup,imageStore,now=Date.now()}){
 if(a.op==='recovery-redraw-plan'||a.op==='recovery-redraw-commit')return illustrationRedraw(p,a,{engine,backup,imageStore,now});
 if(!['recovery-plan','recovery-validate','recovery-commit','recovery-read'].includes(a.op))fail('Unknown recovery operation');
 const t=target(p,a,engine,now),config=JSON.parse(p.files[teachingFile]);
 if(a.op==='recovery-read')return {day:a.day,diary:t.diary,diarySha256:t.diarySha256,inputSha256:t.inputSha256,teaching:teachingView(config,t.job),recovery:p.journalRecoveries?.[t.diary.publication.recoveryId]||null};
 const candidate=a.candidate,requestId=a.requestId;
 let submissionSha256;
 if(a.op!=='recovery-plan'){
  if(!/^[a-z0-9][a-z0-9-]{7,79}$/.test(requestId||'')||candidate?.day!==a.day)fail('Invalid recovery request or candidate date');
  submissionSha256=engine.digest({day:a.day,expectedWorldId:a.expectedWorldId,expectedInputSha256:a.expectedInputSha256,expectedDiarySha256:a.expectedDiarySha256,candidate,...(a.image?{image:a.image}:{})});
  const prior=p.journalRecoveries?.[requestId];
  if(prior){if(prior.submissionSha256!==submissionSha256)fail('Recovery request ID already used for different content');if(prior.day!==a.day||prior.afterSha256!==t.diarySha256)fail('Recovered diary has since changed');return {...prior,reused:true};}
 }
 const imageOnly=eligible(t,p,engine);
 if(a.op==='recovery-plan')return {day:a.day,id:t.job.id,worldId:p.world.publicationWorldId,inputSha256:t.inputSha256,diarySha256:t.diarySha256,originalDiary:t.diary,teaching:teachingView(config,t.job),imageOnly,imageRequired:true,savedCandidateAvailable:!!p.cloudCandidates?.[t.job.id]};
 expected(t,a);
 const draft=mergeCandidate(t.job.draft,candidate),review=candidate.review;
 const errors=engine.validateDailyWriting(t.job.input,draft,review);
 if(errors.length)return {valid:false,errors};
 // Check the current curriculum before any backup or mutation.
 const beforeTeaching=teachingView(config,t.job);
 const contentSha256=engine.digest(engine.writingContent(draft));
 if(imageOnly&&contentSha256!==engine.digest(engine.writingContent(t.diary)))fail('Completed AI text must be reused unchanged when adding an illustration');
 const image=a.image?await validateRecoveryImage(a.image,{engine,job:t.job,requestId,contentSha256,imageStore}):null;
 if(a.op==='recovery-validate')return {valid:true,contentSha256,submissionSha256,imageRequired:true,imageReady:!!image};
 if(!image)fail('Recovery requires a newly generated illustration before commit');
 if(a.expectedContentSha256!==contentSha256)fail('Candidate differs from validated content');
 const backupKey=`backups/manual-before-journal-recovery-${requestId}.json`,backupSha256=engine.digest(p);
 await backup(backupKey,JSON.stringify(p),backupSha256); // Full world + teaching + publication evidence, before mutation.
 const authoredAt=new Date(now).toISOString(),id=t.job.id;
 const record=imageOnly?p.cloudWriting[id].record:{mode:engine.writingMode,authoredAt,characterRevision:t.job.input.characterRevision,inputSha256:t.inputSha256,contentSha256,review,manualRecovery:true};
 // Keep identity, facts, original publication time, level and every non-writing field.
 const next=mergeCandidate(t.diary,candidate);
 next.notice='本篇依原日封存素材完成 AI 四語日記與內建 imagegen 新插圖，圖文已一併復原。完成時間：'+authoredAt+'。';
 next.publication={...t.diary.publication,writing:'ai',mode:'with-image',reason:'manual-recovery',correctedAt:imageOnly?t.diary.publication.correctedAt||record.authoredAt:authoredAt,imageCompletedAt:authoredAt,recoveryId:requestId,fingerprint:engine.digest(contentSha256+image.sha256)};
 next.illustrations=[{id:id+':daily-sketch',cityId:t.job.input.imageRequests[0].cityId,src:'/'+image.key,name:image.name,alt:'Hun-em 的'+image.name+'手繪旅行速寫',caption:image.name,drawnOn:a.day,drawnAt:now,generatedAt:authoredAt}];
 next.narrative={...t.diary.narrative,source:'ai',focus:review.focus};
 for(const l of languages)for(const k of ['stage','exhausted','grammarTitles']){
  if(Object.hasOwn(t.job.draft.learning[l],k))next.learning[l][k]=structuredClone(t.job.draft.learning[l][k]);else delete next.learning[l][k];
 }
 p.world.diaries[p.world.diaries.indexOf(t.diary)]=next;
 if(!imageOnly)engine.syncTeaching([next]);
 const updated=engine.readLearning();
 // Inserting a past lesson must not move a later first/review date backwards incorrectly.
 for(const l of languages)for(const old of beforeTeaching[l]){
  const g=updated.languages[l].grammar.find(g=>g.id===old.id),v=g.teaching,prior=old.teaching;
  if(!v?.publicationKeys?.includes(id))fail('Recovery teaching synchronization failed');
  if(prior.publicationKeys?.includes(id))continue;
  const dates=[a.day,prior.firstTaughtOn,prior.lastTaughtOn].filter(Boolean).sort();
  v.firstTaughtOn=dates[0];v.lastTaughtOn=v.timesTaught>1?dates.at(-1):null;
  if(prior.diaryId&&[prior.firstTaughtOn,prior.lastTaughtOn].filter(Boolean).some(d=>d>a.day))v.diaryId=prior.diaryId;
 }
 if(!imageOnly)engine.writeFileSync(teachingFile,JSON.stringify(updated,null,2));
 p.cloudImages??={};p.cloudImages[id]=image;
 t.job.imageOutcome='generated';t.job.fingerprint=next.publication.fingerprint;
 p.cloudWriting??={};p.cloudWriting[id]={draft:next,record};
 const folder=engine.publicationFolder('/hunem/data',id);
 engine.writeFileSync(folder+'/writing.json',JSON.stringify(record));engine.writeFileSync(folder+'/draft.json',JSON.stringify(next));
 const result={recovered:true,requestId,day:a.day,id,authoredAt,writingAuthoredAt:record.authoredAt,imageOnly,originalPublishedAt:t.diary.publication.publishedAt,backupKey,backupSha256,inputSha256:t.inputSha256,beforeSha256:t.diarySha256,afterSha256:engine.digest(next),contentSha256,submissionSha256,imagesAdded:1,image:{key:image.key,sha256:image.sha256}};
 p.journalRecoveries??={};p.journalRecoveries[requestId]=result;
 engine.writeFileSync(folder+'/recovery-'+requestId+'.json',JSON.stringify(result));
 return result;
}

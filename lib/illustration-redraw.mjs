// Explicit owner maintenance through the existing publication boundary. Never scheduled.
import {pngReceipt} from '../bridge/mcp-file.mjs';
const fail=m=>{throw Object.assign(new Error(m),{status:409});};
export async function illustrationRedraw(p,a,{engine,backup,imageStore,now=Date.now()}){
 if(p.world.publicationWorldId!==a.expectedWorldId)fail('Redraw world mismatch');
 if(!['recovery-redraw-plan','recovery-redraw-commit'].includes(a.op))fail('Unknown redraw operation');
 if(a.op==='recovery-redraw-plan')return {worldId:p.world.publicationWorldId,targets:p.world.diaries.filter(d=>d.day<engine.realDay(now)&&d.illustrations?.length).map(d=>({day:d.day,diarySha256:engine.digest(d),illustrations:d.illustrations}))};
 if(!/^[a-z0-9][a-z0-9-]{7,79}$/.test(a.requestId||'')||!Array.isArray(a.items)||!a.items.length||a.items.length>8)fail('Invalid redraw request');
 const submissionSha256=engine.digest({expectedWorldId:a.expectedWorldId,items:a.items});
 const prior=p.illustrationRedraws?.[a.requestId];
 if(prior){if(prior.submissionSha256!==submissionSha256)fail('Redraw request ID already used');for(const t of prior.images){const d=p.world.diaries.find(d=>d.day===t.day);if(!d?.illustrations.some(i=>i.id===t.id&&i.src==='/'+t.key))fail('Redrawn illustration has since changed');}return {...prior,reused:true};}
 const seen=new Set(),targets=[];
 for(const item of a.items){
  if(seen.has(item.day)||item.day>=engine.realDay(now))fail('Redraw requires unique past dates');seen.add(item.day);
  const diaries=p.world.diaries.filter(d=>d.day===item.day),jobs=p.world.publicationJobs.filter(j=>j.day===item.day);
  if(diaries.length!==1||jobs.length!==1)fail('Redraw requires one diary and archive');
  const d=diaries[0],j=jobs[0],art=d.illustrations?.find(i=>i.id===item.id);
  if(j.status!=='published'||d.publication?.id!==j.id||!art||art.src!==item.expectedSrc||engine.digest(d)!==item.expectedDiarySha256)fail('Redraw diary changed; prepare again');
  const key=`generated/${j.id}/redraw-${a.requestId}.png`;if(item.key!==key)fail('Redraw image path mismatch');
  const old=await imageStore.get(art.src.slice(1)),fresh=await imageStore.get(key);if(!old||!fresh)fail('Redraw image missing');
  const oldBytes=Buffer.from(await old.arrayBuffer()),bytes=Buffer.from(await fresh.arrayBuffer()),receipt=pngReceipt(bytes),review=item.review;
  if(imageStore.hash(oldBytes)!==item.expectedImageSha256||receipt.sha256!==item.sha256||receipt.width!==receipt.height||receipt.sha256===item.expectedImageSha256)fail('Redraw hash or square format mismatch');
  if(review?.tool!=='image_gen.imagegen'||review.actuallyCalled!==true||!review.originalGeneratedPath||review.visualReview?.blackFur!==true||review.visualReview?.yellowScarf!==true||review.visualReview?.sameScene!==true||review.visualReview?.squareFullBleed!==true)fail('Redraw requires actual imagegen and visual review');
  targets.push({d,j,art,item,receipt,oldBytes});
 }
 const backupKey=`backups/manual-before-illustration-redraw-${a.requestId}.json`;
 await backup(backupKey,JSON.stringify(p),engine.digest(p));
 // The complete snapshot retains references to immutable original objects, which remain stored.
 const at=new Date(now).toISOString(),images=[];
 for(const {d,j,art,item,receipt}of targets){
  const oldSrc=art.src;art.src='/'+item.key;art.redrawnAt=at;
  if(p.cloudImages?.[j.id])p.cloudImages[j.id]={...p.cloudImages[j.id],key:item.key,sha256:receipt.sha256,review:item.review,redrawnAt:at,originalKey:oldSrc.slice(1)};
  const writing=p.cloudWriting?.[j.id];if(writing?.draft?.illustrations?.some(i=>i.id===art.id))writing.draft.illustrations=structuredClone(d.illustrations);
  if(writing?.record?.contentSha256){d.publication.fingerprint=engine.digest(writing.record.contentSha256+receipt.sha256);j.fingerprint=d.publication.fingerprint;}
  images.push({day:d.day,id:art.id,originalSrc:oldSrc,originalSha256:item.expectedImageSha256,key:item.key,sha256:receipt.sha256,width:receipt.width,height:receipt.height});
 }
 const result={redrawn:true,requestId:a.requestId,at,backupKey,submissionSha256,images};
 p.illustrationRedraws??={};p.illustrationRedraws[a.requestId]=result;
 return result;
}

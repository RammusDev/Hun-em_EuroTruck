import {env} from 'cloudflare:workers';
// @ts-ignore
import {cookie,readCookie,seal,open} from '../../../lib/probe.mjs';
// @ts-ignore
import {register,principal,allowed,SESSION_SECONDS,consumeFlow} from '../../../lib/access.mjs';
// @ts-ignore
import {verifyGoogleIdToken} from '../../../lib/google-id.mjs';
// @ts-ignore
import {FLOW_SECONDS,flowCookieName,readFlow} from '../../../lib/login-flow.mjs';
export const dynamic='force-dynamic';
const base={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(v:any,status=200)=>Response.json(v,{status,headers:{...base,'Content-Type':'application/json; charset=utf-8'}});
const settings=()=>({client:(env as any).GOOGLE_CLIENT_ID,secret:(env as any).PROBE_SESSION_SECRET});
export async function GET(req:Request){const path=new URL(req.url).pathname,{client,secret}=settings();
 if(path==='/probe/status'){const s=await open(readCookie(req,'__Host-probe_session'),secret),p=await principal((env as any).DB,s);return json({isolated:false,configured:!!(client&&secret),googleSessionValid:!!p,loginId:p?s?.loginId??null:null,email:p?.email??null,role:p?.owner?'owner':p?.status,readerAccess:allowed(p),productionAccess:allowed(p)},p?200:401);}
 if(path!=='/probe/login')return json({error:'Not found'},404);
 if(!client||!secret)return json({error:'Google OAuth configuration required'},503);
 const safeClient=JSON.stringify(client).replace(/</g,'\\u003c');
 const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Hun-em Google 登入</title><link rel="stylesheet" href="/access.css"><style>body{margin:0}#login-retry[hidden]{display:none}#login-retry{display:block;margin:16px auto}</style><body class="access-shell access-reader access-login"><header class="access-topbar"><a class="access-brand" href="/"><img src="/site-art/company.webp" width="48" height="48" alt="HMD Express"><span>HUN-EM<small>LETTERS FROM THE ROAD</small></span></a><nav><a href="/about">關於這段旅程 →</a></nav></header><main class="access-main"><div class="access-invitation"><section class="access-story"><p class="access-eyebrow">A LITTLE COMPANY ON THE ROAD</p><h1>工作是送貨，<br>生活是沿途的風景。</h1><p>跟著 Hun-em 穿過歐洲，<br>讀一段日記，也用另一種語言看看世界。</p><img src="/site-art/hero.webp" width="720" height="480" alt="披著黃色圍巾的全黑貓 Hun-em 與黑色卡車"><span class="access-story-caption">同一隻黑貓，同一段慢慢前進的旅程。</span></section><section class="access-paper access-application"><p class="access-eyebrow">WELCOME TO THE JOURNEY</p><h2>先認識你，再一起出發。</h2><p class="access-subtitle">使用 Google 確認你的身分。已核准的讀者可直接進入旅途；第一次來，歡迎提出觀看申請。</p><div class="access-steps"><span class="current">01 登入</span><i></i><span>02 申請</span><i></i><span>03 審核</span></div><div id="button"></div><p id="message" role="status">載入中…</p><button id="login-retry" type="button" class="access-button primary" hidden>重新登入</button><p class="access-help centered">不會讀取你的郵件，也不會自動授予觀看資格。</p><p class="access-session-note">登入保留 7 天 · 觀看資格由擁有者核准</p></section></div></main><footer class="access-footer"><span>HUN-EM · 慢慢開，好好看世界。</span><nav><a href="/privacy">隱私政策</a><a href="/terms">服務條款</a></nav></footer><script>window.hunemGoogleClient=${safeClient};</script><script src="/login.js"></script><script src="https://accounts.google.com/gsi/client" async defer onload="ready()"></script></body></html>`;
 return new Response(html,{headers:{...base,'Content-Type':'text/html;charset=utf-8','Cross-Origin-Opener-Policy':'same-origin-allow-popups'}});
}
export async function POST(req:Request){const path=new URL(req.url).pathname,{client,secret}=settings();
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Invalid origin'},403);
 if(path==='/probe/logout'){const s=await open(readCookie(req,'__Host-probe_session'),secret);if(s?.sid)await (env as any).DB.prepare('DELETE FROM sessions WHERE id=?').bind(s.sid).run();return new Response(null,{status:204,headers:{...base,'Set-Cookie':cookie('__Host-probe_session','',0)}});}
 if(!['/probe/verify','/probe/prepare','/probe/check'].includes(path))return json({error:'Not found'},404);
 if(!client||!secret)return json({error:'Google OAuth configuration required'},503);
 const requestId=crypto.randomUUID();
 const fail=(code:string,error:string,status=403)=>{console.warn(JSON.stringify({event:'login_failure',code,requestId}));return json({error,code,requestId},status);};
 if(path==='/probe/prepare'){
  try{
  const nonce=crypto.randomUUID(),expires=Date.now()+FLOW_SECONDS*1000;
  const flow=await seal({nonce,exp:expires},secret);
  await (env as any).DB.batch([(env as any).DB.prepare('DELETE FROM auth_flows WHERE expires<=?').bind(Date.now()),(env as any).DB.prepare('INSERT INTO auth_flows(nonce,expires) VALUES(?,?)').bind(nonce,expires)]);
  return Response.json({nonce},{headers:{...base,'Set-Cookie':cookie(flowCookieName(nonce),flow,FLOW_SECONDS)}});
  }catch{return fail('login_unavailable','登入服務暫時無法使用，請稍後重新登入。',503);}
 }
 if(Number(req.headers.get('content-length')||0)>16384)return json({error:'Request too large'},413);
 try{const text=await req.text();if(text.length>16384)return json({error:'Request too large'},413);const {credential,nonce}=JSON.parse(text);
 const result=await readFlow(req,secret,nonce);
 if(!result.payload)return fail(result.code||'flow_invalid','登入流程已失效，請重新登入。');
 const flow=result.payload;
 if(path==='/probe/check')return json({ready:true});
 if(typeof credential!=='string'||credential.length>12000)return json({error:'Invalid credential'},400);
 let user;
 try{user=await verifyGoogleIdToken(credential,client,flow.nonce);}catch{return fail('verification_failed','無法確認 Google 登入，請重新登入。',401);}
 if(!await consumeFlow((env as any).DB,flow.nonce))return fail('flow_used','這次登入流程已結束，請重新登入。');
 const loginId=crypto.randomUUID();const session=await register((env as any).DB,user,(env as any).OWNER_EMAIL),value=await seal({sid:session.sid,sub:session.sub,authAt:session.authAt,exp:session.exp,loginId},secret);
 const h=new Headers(base);h.append('Set-Cookie',cookie('__Host-probe_session',value,SESSION_SECONDS));h.append('Set-Cookie',cookie(nonce===undefined?'__Host-probe_flow':flowCookieName(nonce),'',0));return Response.json({verified:true,isolated:false,loginId},{headers:h});
 }catch{return fail('login_unavailable','登入服務暫時無法使用，請稍後重新登入。',503);}
}

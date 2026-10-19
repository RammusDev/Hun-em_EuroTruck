import {env} from 'cloudflare:workers';
// @ts-ignore
import {cookie,readCookie,seal,open} from '../../../lib/probe.mjs';
// @ts-ignore
import {register,principal,allowed,SESSION_SECONDS,consumeFlow} from '../../../lib/access.mjs';
// @ts-ignore
import {verifyGoogleIdToken} from '../../../lib/google-id.mjs';
export const dynamic='force-dynamic';
const base={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(v:any,status=200)=>Response.json(v,{status,headers:{...base,'Content-Type':'application/json; charset=utf-8'}});
const settings=()=>({client:(env as any).GOOGLE_CLIENT_ID,secret:(env as any).PROBE_SESSION_SECRET});
export async function GET(req:Request){const path=new URL(req.url).pathname,{client,secret}=settings();
 if(path==='/probe/status'){const s=await open(readCookie(req,'__Host-probe_session'),secret),p=await principal((env as any).DB,s);return json({isolated:false,configured:!!(client&&secret),googleSessionValid:!!p,email:p?.email??null,role:p?.owner?'owner':p?.status,readerAccess:allowed(p),productionAccess:allowed(p)},p?200:401);}
 if(path!=='/probe/login')return json({error:'Not found'},404);
 if(!client||!secret)return json({error:'Google OAuth configuration required'},503);
 const nonce=crypto.randomUUID(),flow=await seal({nonce,exp:Date.now()+300000},secret),safeClient=JSON.stringify(client).replace(/</g,'\\u003c');
 await (env as any).DB.batch([(env as any).DB.prepare('DELETE FROM auth_flows WHERE expires<=?').bind(Date.now()),(env as any).DB.prepare('INSERT INTO auth_flows(nonce,expires) VALUES(?,?)').bind(nonce,Date.now()+300000)]);
 const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Hun-em Google 登入</title><link rel="stylesheet" href="/access.css"><style>body{margin:0}</style><body class="access-shell access-reader access-login"><header class="access-topbar"><a class="access-brand" href="/"><img src="/site-art/company.webp" width="48" height="48" alt="HMD Express"><span>HUN-EM<small>LETTERS FROM THE ROAD</small></span></a><nav><a href="/about">關於這段旅程 →</a></nav></header><main class="access-main"><div class="access-invitation"><section class="access-story"><p class="access-eyebrow">A LITTLE COMPANY ON THE ROAD</p><h1>工作是送貨，<br>生活是沿途的風景。</h1><p>跟著 Hun-em 穿過歐洲，<br>讀一段日記，也用另一種語言看看世界。</p><img src="/site-art/hero.webp" width="720" height="480" alt="披著黃色圍巾的全黑貓 Hun-em 與黑色卡車"><span class="access-story-caption">同一隻黑貓，同一段慢慢前進的旅程。</span></section><section class="access-paper access-application"><p class="access-eyebrow">WELCOME TO THE JOURNEY</p><h2>先認識你，再一起出發。</h2><p class="access-subtitle">使用 Google 確認你的身分。已核准的讀者可直接進入旅途；第一次來，歡迎提出觀看申請。</p><div class="access-steps"><span class="current">01 登入</span><i></i><span>02 申請</span><i></i><span>03 審核</span></div><div id="button"></div><p id="message" role="status">載入中…</p><p class="access-help centered">不會讀取你的郵件，也不會自動授予觀看資格。</p><p class="access-session-note">登入保留 7 天 · 觀看資格由擁有者核准</p></section></div></main><footer class="access-footer"><span>HUN-EM · 慢慢開，好好看世界。</span><nav><a href="/privacy">隱私政策</a><a href="/terms">服務條款</a></nav></footer><script>async function received(r){try{const x=await fetch('/probe/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:r.credential})});const d=await x.json();if(!x.ok)throw Error(d.error);location.assign('/');}catch(e){document.getElementById('message').textContent=e.message;}}function ready(){google.accounts.id.initialize({client_id:${safeClient},callback:received,nonce:${JSON.stringify(nonce)},auto_select:false});google.accounts.id.renderButton(document.getElementById('button'),{theme:'outline',size:'large'});document.getElementById('message').textContent='請選擇你的 Google 帳號。';}</script><script src="https://accounts.google.com/gsi/client" async defer onload="ready()"></script></body></html>`;
 return new Response(html,{headers:{...base,'Content-Type':'text/html;charset=utf-8','Set-Cookie':cookie('__Host-probe_flow',flow,300),'Cross-Origin-Opener-Policy':'same-origin-allow-popups'}});
}
export async function POST(req:Request){const path=new URL(req.url).pathname,{client,secret}=settings();
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Invalid origin'},403);
 if(path==='/probe/logout'){const s=await open(readCookie(req,'__Host-probe_session'),secret);if(s?.sid)await (env as any).DB.prepare('DELETE FROM sessions WHERE id=?').bind(s.sid).run();return new Response(null,{status:204,headers:{...base,'Set-Cookie':cookie('__Host-probe_session','',0)}});}
 if(path!=='/probe/verify')return json({error:'Not found'},404);
 if(!client||!secret)return json({error:'Google OAuth configuration required'},503);
 const flow=await open(readCookie(req,'__Host-probe_flow'),secret);if(!flow)return json({error:'Login flow expired'},403);
 if(Number(req.headers.get('content-length')||0)>16384)return json({error:'Request too large'},413);
 try{const text=await req.text();if(text.length>16384)return json({error:'Request too large'},413);const {credential}=JSON.parse(text);if(typeof credential!=='string'||credential.length>12000)return json({error:'Invalid credential'},400);
 const user=await verifyGoogleIdToken(credential,client,flow.nonce);
 if(!await consumeFlow((env as any).DB,flow.nonce))return json({error:'Login flow expired or already used'},403);
 const session=await register((env as any).DB,user,(env as any).OWNER_EMAIL),value=await seal({sid:session.sid,sub:session.sub,authAt:session.authAt,exp:session.exp},secret);
 const h=new Headers(base);h.append('Set-Cookie',cookie('__Host-probe_session',value,SESSION_SECONDS));h.append('Set-Cookie',cookie('__Host-probe_flow','',0));return Response.json({verified:true,isolated:false},{headers:h});
 }catch{return json({error:'Verification failed; restart login'},401);}
}

const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export const cookie=(n,v,age)=>`${n}=${v}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
export function readCookie(req,n){return req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(n+'='))?.slice(n.length+1)||'';}
async function key(s){if(!s||s.length<32)throw Error('NOT_CONFIGURED');return crypto.subtle.importKey('raw',enc.encode(s),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function seal(p,s){const b=b64(enc.encode(JSON.stringify(p)));return b+'.'+b64(await crypto.subtle.sign('HMAC',await key(s),enc.encode(b)));}
export async function open(v,s,now=Date.now()){try{const [b,sig,extra]=v.split('.');if(extra||!b||!sig||!await crypto.subtle.verify('HMAC',await key(s),decode(sig),enc.encode(b)))return null;const p=JSON.parse(new TextDecoder().decode(decode(b)));return Number.isFinite(p.exp)&&p.exp>now?p:null;}catch{return null;}}
export function claims(p,client,nonce,now=Date.now()){
 if(!client||p.aud!==client||!['accounts.google.com','https://accounts.google.com'].includes(p.iss)||!Number.isFinite(Number(p.exp))||Number(p.exp)*1000<=now||typeof p.sub!=='string'||!p.sub||!nonce||p.nonce!==nonce)throw Error('INVALID_ID_TOKEN');
 if(![true,'true'].includes(p.email_verified)||typeof p.email!=='string'||!p.email.toLowerCase().endsWith('@gmail.com'))throw Error('GMAIL_REQUIRED');
 return {sub:p.sub,email:p.email};
}

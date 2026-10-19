import {env} from 'cloudflare:workers';
// @ts-ignore
import {open,seal,readCookie} from './probe.mjs';
// @ts-ignore
import {principal} from './access.mjs';
// @ts-ignore
import {error} from './world-policy.mjs';
export function platformOwner(req:Request){
 const config=env as any,id=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email');
 return !!(config.WORLD_OWNER_PLATFORM_ID&&config.OWNER_EMAIL&&id===config.WORLD_OWNER_PLATFORM_ID&&email?.toLowerCase()===String(config.OWNER_EMAIL).toLowerCase());
}
export function platformBootstrap(req:Request,message:any){
 const config=env as any;
 return config.WORLD_OWNER_BOOTSTRAP==='true'&&!config.WORLD_OWNER_PLATFORM_ID&&message.method==='tools/call'&&message.params?.name==='hunem_status'&&!!req.headers.get('oai-authenticated-user-id')&&req.headers.get('oai-authenticated-user-email')?.toLowerCase()===String(config.OWNER_EMAIL||'').toLowerCase();
}
export async function worldActor(req:Request){
 const config=env as any,origin=new URL(req.url).origin;
 const token=readCookie(req,'__Host-hunem_service');if(token){const ticket=await open(token,config.WORLD_SERVICE_SECRET);if(!ticket||ticket.kind!=='world-service'||ticket.aud!==origin||!Array.isArray(ticket.scopes)||!ticket.scopes.every((s:any)=>['sync','publication','reference'].includes(s)))throw error('Invalid service ticket',401);return {role:'service',scopes:ticket.scopes};}
 const s=await open(readCookie(req,'__Host-probe_session'),config.PROBE_SESSION_SECRET),p=await principal(config.DB,s);
 return p?{role:'user',owner:!!p.owner,adminFresh:p.adminFresh,reader:!!p.owner||p.status==='approved',sub:p.sub}:null;
}
export async function serviceTicket(req:Request){
 if(!platformOwner(req))throw error('Only the pinned platform owner may issue service tickets');
 const config=env as any;if(!config.WORLD_SERVICE_SECRET)throw error('Service authentication not configured',503);
 return {ticket:await seal({kind:'world-service',aud:new URL(req.url).origin,scopes:['sync','publication','reference'],exp:Date.now()+300000},config.WORLD_SERVICE_SECRET),expiresIn:300};
}
export async function requireReader(req:Request){const p=await worldActor(req);if(!p)throw error('請先使用Google登入',401);if(p.role==='service'){if(!p.scopes.includes('reference'))throw error('Service scope denied');return p;}if(!p.reader)throw error('尚未取得觀看許可');return p;}

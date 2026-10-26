import {readCookie,inspectSeal} from './probe.mjs';
export const FLOW_SECONDS=300;
export const validNonce=n=>typeof n==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(n);
export const flowCookieName=n=>'__Host-probe_flow_'+n;
export async function readFlow(req,secret,nonce){
 // Support pages already open at deployment; new pages always specify their flow.
 if(nonce!==undefined&&!validNonce(nonce))return {code:'flow_invalid',payload:null};
 const result=await inspectSeal(readCookie(req,nonce===undefined?'__Host-probe_flow':flowCookieName(nonce)),secret);
 if(result.payload&&(!validNonce(result.payload.nonce)||(nonce!==undefined&&result.payload.nonce!==nonce)))return {code:'flow_invalid',payload:null};
 return result;
}

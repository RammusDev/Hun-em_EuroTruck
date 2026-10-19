import {createRemoteJWKSet,jwtVerify} from 'jose';
import {claims} from './probe.mjs';
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:5000,cooldownDuration:30000,cacheMaxAge:3600000});
export async function verifyGoogleIdToken(token,client,nonce,{keyResolver=googleKeys,now=Date.now()}={}){
 const {payload}=await jwtVerify(token,keyResolver,{algorithms:['RS256'],issuer:['accounts.google.com','https://accounts.google.com'],audience:client,requiredClaims:['exp','iat','sub','nonce','email','email_verified'],currentDate:new Date(now),maxTokenAge:'2h'});
 if(payload.azp!==undefined&&payload.azp!==client)throw Error('INVALID_AUTHORIZED_PARTY');
 return claims(payload,client,nonce,now);
}

import {test} from 'node:test';import assert from 'node:assert/strict';import {generateKeyPair,SignJWT} from 'jose';import {verifyGoogleIdToken} from '../lib/google-id.mjs';
test('real RS256 signatures validate issuer/audience/expiry/nonce and reject forged keys',async()=>{
 const good=await generateKeyPair('RS256'),bad=await generateKeyPair('RS256'),now=Date.now(),seconds=Math.floor(now/1000);
 const payload={iss:'https://accounts.google.com',aud:'client',sub:'123',iat:seconds,exp:seconds+300,nonce:'nonce',email:'test@gmail.com',email_verified:true};
 const sign=(p,key=good.privateKey)=>new SignJWT(p).setProtectedHeader({alg:'RS256',kid:'test'}).sign(key);
 const options={keyResolver:good.publicKey,now};assert.equal((await verifyGoogleIdToken(await sign(payload),'client','nonce',options)).sub,'123');
 for(const patch of [{iss:'https://attacker.test'},{aud:'other'},{exp:seconds-1},{nonce:'bad'},{email_verified:false},{azp:'other'}]){const token=await sign({...payload,...patch});await assert.rejects(()=>verifyGoogleIdToken(token,'client','nonce',options));}
 const forged=await sign(payload,bad.privateKey);await assert.rejects(()=>verifyGoogleIdToken(forged,'client','nonce',options));
});

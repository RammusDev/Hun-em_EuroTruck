import {test} from 'node:test';import assert from 'node:assert/strict';import {gmailConfigured,rawNotification} from '../lib/gmail.mjs';
test('sender is explicit, independent of owner and resistant to header injection',()=>{
 const c={GOOGLE_CLIENT_ID:'test',GMAIL_CLIENT_SECRET:'test',GMAIL_REFRESH_TOKEN:'test',OWNER_EMAIL:'owner@gmail.com',GMAIL_SENDER_EMAIL:'sender@gmail.com'};
 assert.equal(gmailConfigured(c),true);assert.equal(gmailConfigured({...c,GMAIL_SENDER_EMAIL:undefined}),false);assert.equal(gmailConfigured({...c,GMAIL_SENDER_EMAIL:'sender@gmail.com\r\nBcc: bad@gmail.com'}),false);
 const mime=Buffer.from(rawNotification(c.GMAIL_SENDER_EMAIL,c.OWNER_EMAIL,'https://probe.test/admin','test-id'),'base64url').toString();assert.match(mime,/From: sender@gmail.com\r\nTo: owner@gmail.com/);
 assert.throws(()=>rawNotification('sender@gmail.com\r\nBcc: bad@gmail.com',c.OWNER_EMAIL,'https://probe.test/admin','id'));
});

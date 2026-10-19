const validEmail=value=>typeof value==='string'&&/^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(value);
export const gmailConfigured=c=>!!((c.GMAIL_CLIENT_ID||c.GOOGLE_CLIENT_ID)&&c.GMAIL_CLIENT_SECRET&&c.GMAIL_REFRESH_TOKEN&&validEmail(c.OWNER_EMAIL)&&validEmail(c.GMAIL_SENDER_EMAIL));
export function rawNotification(sender,owner,link,id){
 if(!validEmail(sender)||!validEmail(owner)||!/^https:\/\/[^\s<>]+\/admin$/.test(link)||! /^[a-zA-Z0-9-]+$/.test(id))throw Error('INVALID_NOTIFICATION');
 const subject=btoa(String.fromCharCode(...new TextEncoder().encode('Hun-em：有新的觀看申請')));
 const body='有新的觀看申請，請登入管理頁查看及審核：\r\n'+link+'\r\n\r\n此信不會自動核准，也不包含申請者email或理由。';
 const mime=`From: ${sender}\r\nTo: ${owner}\r\nSubject: =?UTF-8?B?${subject}?=\r\nMessage-ID: <hunem-${id}@hunem.invalid>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${btoa(String.fromCharCode(...new TextEncoder().encode(body)))}`;
 return btoa(String.fromCharCode(...new TextEncoder().encode(mime))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
export async function gmailAccessToken(config,fetcher=fetch){
 const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.GMAIL_CLIENT_ID||config.GOOGLE_CLIENT_ID,client_secret:config.GMAIL_CLIENT_SECRET,refresh_token:config.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('GMAIL_AUTH_'+r.status);const data=await r.json();if(typeof data.access_token!=='string'||!data.access_token)throw Error('GMAIL_AUTH_INVALID');return data.access_token;
}

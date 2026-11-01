// One deployment origin for links in outgoing notifications; no request or state mutation.
export function journeyUrl(origin='https://hun-em-europe.rammus-shigoto.chatgpt.site'){
 const u=new URL(origin);
 if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password)throw Error('INVALID_SITE_ORIGIN');
 return u.origin+'/journey';
}

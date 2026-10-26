// A flow belongs to this page. No credentials or flow tokens enter browser storage.
let loginFlow=null,loginBusy=false,loginComplete=false,loginPreparing=false;
const message=()=>document.getElementById('message');
const retry=()=>document.getElementById('login-retry');
async function loginRequest(path,body){
 const response=await fetch('/probe/'+path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();
 if(!response.ok)throw Object.assign(new Error(data.error||'暫時無法登入，請再試一次。'),{code:data.code});
 return data;
}
async function prepareLogin(recovering=false){
 if(loginPreparing||loginComplete)return;
 loginPreparing=true;loginFlow=null;retry().hidden=true;
 document.getElementById('button').replaceChildren();
 message().textContent='正在準備登入…';
 try{
  const flow=await loginRequest('prepare',{});
  // Confirm the HttpOnly cookie returns before asking the user to authorize Google.
  await loginRequest('check',{nonce:flow.nonce});
  loginFlow=flow;
  google.accounts.id.initialize({client_id:window.hunemGoogleClient,callback:received,nonce:flow.nonce,auto_select:false});
  google.accounts.id.renderButton(document.getElementById('button'),{theme:'outline',size:'large'});
  message().textContent=recovering?'登入流程已重新準備好，請再選擇一次 Google 帳號。':'請選擇你的 Google 帳號。';
 }catch(e){message().textContent=e.code==='flow_missing'?'瀏覽器未保存登入所需的 Cookie，請允許此網站使用 Cookie 後再試。':e.message;retry().hidden=false;}
 finally{loginPreparing=false;}
}
async function sessionConfirmed(loginId){
 const response=await fetch('/probe/status',{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)return false;
 const session=await response.json();
 return !!loginId&&session.googleSessionValid===true&&session.loginId===loginId;
}
async function received(result){
 if(loginBusy||loginComplete||!loginFlow)return;
 loginBusy=true;retry().hidden=true;message().textContent='正在確認登入…';
 document.getElementById('button').style.pointerEvents='none';
 try{
  const verified=await loginRequest('verify',{credential:result.credential,nonce:loginFlow.nonce});
  if(!await sessionConfirmed(verified.loginId))throw Object.assign(new Error('瀏覽器未保留登入狀態，請允許此網站使用 Cookie 後再試。'),{code:'session_missing'});
  loginComplete=true;location.assign('/');
 }catch(e){
  if(e.code?.startsWith('flow_'))await prepareLogin(true);
  else{message().textContent=e.message;loginFlow=null;document.getElementById('button').replaceChildren();retry().hidden=false;}
 }finally{loginBusy=false;document.getElementById('button').style.pointerEvents='';}
}
function ready(){retry().addEventListener('click',()=>prepareLogin());prepareLogin();}

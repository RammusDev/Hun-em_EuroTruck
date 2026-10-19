'use client';
import {useEffect,useState} from 'react';
import AccessView from './access-view';
export default function Panel({admin=false,autoEnter=false}:{admin?:boolean;autoEnter?:boolean}){
 const [me,setMe]=useState<any>(null),[data,setData]=useState<any>(null),[error,setError]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[limit,setLimit]=useState(10),[filter,setFilter]=useState('pending'),[notice,setNotice]=useState('');
 async function refresh(){const r=await fetch('/access/status',{cache:'no-store'});if(r.status===401){if(autoEnter&&!admin){location.replace('/probe/login');return;}setMe({signedOut:true});return;}const m:any=await r.json();if(!r.ok)throw Error(m.error);if(autoEnter&&!admin&&m.readerAccess===true){location.replace('/journey');return;}setMe(m);if(admin&&m.owner){setData(null);const a=await fetch('/access/admin');const d:any=await a.json();if(!a.ok)throw Error(d.error);setData(d);setLimit(d.capacity);}}
 useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
 async function post(action:string,body:any){setBusy(true);setError('');setNotice('');try{const r=await fetch('/access/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d:any=await r.json();if(!r.ok)throw Error(d.error);if(action==='apply')setNotice('申請已保存，擁有者會親自審核。');else if(action==='retry')setNotice(({accepted:'Gmail 已受理這筆通知。',idle:'目前沒有到期的待寄通知。',not_configured:'申請已保存，寄信授權尚未設定。',review:'寄送結果需要確認，請先檢查 Gmail 寄件備份。',failed:'這次寄送未成功，請查看通知紀錄。'} as any)[d.state]||'通知處理完成。');else if(action==='capacity')setNotice('讀者名額已儲存。');else if(action==='decision')setNotice('觀看資格已更新。');else if(action==='remove')setNotice('帳號已移除，可以重新提出申請。');await refresh();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 async function logout(){setBusy(true);setError('');try{const r=await fetch('/probe/logout',{method:'POST'});if(!r.ok)throw Error('登出失敗');location.assign('/');}catch(e:any){setError(e.message);setBusy(false);}}
 return <AccessView {...{admin,me,data,error,notice,busy,reason,setReason,limit,setLimit,post,logout,filter,setFilter}} refresh={()=>refresh().catch(e=>setError(e.message))}/>;
}

import {backgroundTick} from '../../../lib/background-tick';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 try{return Response.json(await backgroundTick(req),{headers:{'Cache-Control':'no-store'}});}
 catch(error:any){return Response.json({error:error.status&&error.status<500?error.message:'Background update unavailable'},{status:error.status||503,headers:{'Cache-Control':'no-store'}});}
}

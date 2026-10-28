import {env} from 'cloudflare:workers';
import {footprintEventService} from '../bridge/footprint-events.mjs';
import {committed} from './runtime';
export const footprintEvents=()=>{
 const service=footprintEventService({db:env.DB,bucket:env.BUCKET});
 return {...service,status:async(p?:any)=>service.status(p||await committed())};
};

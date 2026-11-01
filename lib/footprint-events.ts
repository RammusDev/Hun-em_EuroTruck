import {env} from 'cloudflare:workers';
import {footprintEventService} from '../bridge/footprint-events.mjs';
import {committed} from './runtime';
export const footprintEvents=()=>{
 const service=footprintEventService({db:env.DB,bucket:env.BUCKET,siteOrigin:(env as any).BACKGROUND_TICK_ORIGIN});
 return {...service,status:async(p?:any)=>service.status(p||await committed())};
};

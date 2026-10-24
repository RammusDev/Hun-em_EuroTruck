import {env} from 'cloudflare:workers';
import {footprintEventService} from '../bridge/footprint-events.mjs';
export const footprintEvents=()=>footprintEventService({db:env.DB,bucket:env.BUCKET});

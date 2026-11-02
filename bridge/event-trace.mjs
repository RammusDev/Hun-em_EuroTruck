// Diagnostic metadata only. Workers clocks advance on I/O, so sampled durations
// are not a CPU profiler and zero never proves that synchronous work was free.
export function createEventTrace(scope,{now=Date.now,log=console.log,id=crypto.randomUUID()}={}){
 const start=now();
 const mark=(stage,state,stats={})=>log(JSON.stringify({action:'event-timing',trace:id,scope,stage,state,elapsedMs:now()-start,...stats}));
 return {mark,async span(stage,work){const at=now();mark(stage,'start');try{const value=await work();mark(stage,'complete',{sampledMs:now()-at});return value;}catch(error){mark(stage,'failed',{sampledMs:now()-at});throw error;}}};
}

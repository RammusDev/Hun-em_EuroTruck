// Frozen piecewise road timing, shared by the engine and map animation.
(() => {
 function compile(leg){
  const spans=leg.timings?.length?leg.timings:[{km:leg.km,minutes:leg.minutes}];
  const kms=[0],minutes=[0];for(const span of spans){kms.push(kms.at(-1)+span.km);minutes.push(minutes.at(-1)+span.minutes);}
  function interpolate(value,from,to){
   if(value<=0)return 0;if(value>=from.at(-1))return to.at(-1);
   let low=1,high=from.length-1;while(low<high){const middle=(low+high)>>1;if(from[middle]<value)low=middle+1;else high=middle;}
   const width=from[low]-from[low-1];return to[low-1]+(to[low]-to[low-1])*(width?(value-from[low-1])/width:0);
  }
  return {kmAt:t=>interpolate(t,minutes,kms),minutesAt:km=>interpolate(km,kms,minutes),progress:t=>leg.km?interpolate(t,minutes,kms)/leg.km:0};
 }
 globalThis.HunemRouteTiming={compile};
})();

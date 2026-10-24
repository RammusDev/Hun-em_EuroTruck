// Browser bundle uses portable JS inflate, avoiding Node-private zlib internals
// that are incompatible with Cloudflare Workers' Inflate implementation.
import png from 'pngjs/browser.js';
import jpeg from 'jpeg-js';
import {pngReceipt} from './mcp-file.mjs';

export const previewPolicy={version:'jpeg-512-q78-v1',maxEdge:512,quality:78,maxBytes:160*1024};
export function makeReferencePreview(bytes,policy=previewPolicy){
 const original=pngReceipt(Buffer.from(bytes));
 const image=png.PNG.sync.read(Buffer.from(bytes),{checkCRC:true});
 const {width:sw,height:sh}=image,channels=4,depth=8;
 const scale=Math.min(1,policy.maxEdge/Math.max(sw,sh)),width=Math.max(1,Math.round(sw*scale)),height=Math.max(1,Math.round(sh*scale));
 const rgba=new Uint8Array(width*height*4),sample=i=>image.data[i]/(depth===16?257:1);
 // Box downsample preserves the whole composition. Alpha is composited on white.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const fromX=Math.floor(x*sw/width),toX=Math.min(sw,Math.ceil((x+1)*sw/width)),fromY=Math.floor(y*sh/height),toY=Math.min(sh,Math.ceil((y+1)*sh/height));
  let r=0,g=0,b=0,n=0;
  for(let sy=fromY;sy<toY;sy++)for(let sx=fromX;sx<toX;sx++){
   const i=(sy*sw+sx)*channels,gray=channels<=2,alpha=channels===2||channels===4?sample(i+channels-1)/255:1;
   r+=sample(i)*alpha+255*(1-alpha);g+=sample(i+(gray?0:1))*alpha+255*(1-alpha);b+=sample(i+(gray?0:2))*alpha+255*(1-alpha);n++;
  }
  const out=(y*width+x)*4;rgba[out]=Math.round(r/n);rgba[out+1]=Math.round(g/n);rgba[out+2]=Math.round(b/n);rgba[out+3]=255;
 }
 const output=jpeg.encode({data:rgba,width,height},policy.quality).data;
 if(output.length>policy.maxBytes)throw Error('REFERENCE_PREVIEW_TOO_LARGE');
 return {bytes:output,width,height,originalBytes:original.bytes,sourceSha256:original.sha256,mimeType:'image/jpeg'};
}

export async function cachedReferencePreview(bytes,{get,put}){
 const source=pngReceipt(Buffer.from(bytes)),key=`reference-previews/${previewPolicy.version}/${source.sha256}.jpg`;
 const cached=await get(key);
 if(cached){const data=Buffer.from(await cached.arrayBuffer());if(data.length<=previewPolicy.maxBytes&&data[0]===255&&data[1]===216)return {bytes:data,key,cacheHit:true,originalBytes:source.bytes,mimeType:'image/jpeg'};}
 const preview=makeReferencePreview(bytes);
 await put(key,preview.bytes,{httpMetadata:{contentType:preview.mimeType},customMetadata:{sourceSha256:source.sha256,policy:previewPolicy.version}});
 return {...preview,key,cacheHit:false};
}

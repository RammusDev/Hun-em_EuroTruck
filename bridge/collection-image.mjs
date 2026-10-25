import png from 'pngjs/browser.js';
import {pngReceipt} from './mcp-file.mjs';
export function validateCollectionImage(bytes){
 const receipt=pngReceipt(bytes);if(receipt.width!==receipt.height)throw Error('SQUARE_PNG_REQUIRED');
 const image=png.PNG.sync.read(Buffer.from(bytes),{checkCRC:true});let transparent=false,visible=false;
 for(let i=3;i<image.data.length;i+=4){if(image.data[i]===0)transparent=true;if(image.data[i]>0)visible=true;if(transparent&&visible)break;}
 if(!transparent||!visible)throw Error('TRANSPARENT_SUBJECT_REQUIRED');return receipt;
}

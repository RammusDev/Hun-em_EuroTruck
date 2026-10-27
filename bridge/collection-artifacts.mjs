import {createHash} from 'node:crypto';
import {referenceMime} from './collection-reference.mjs';
export async function verifyCollectionArtifacts(bucket,image){
 const [original,thumbnail]=await Promise.all([bucket.get(image.src.replace(/^\//,'')),bucket.get(image.thumbnail.replace(/^\//,''))]);
 if(!original||!thumbnail)throw Error('COLLECTION_ARTIFACT_READBACK_REQUIRED');
 const [a,b]=await Promise.all([original.arrayBuffer(),thumbnail.arrayBuffer()]);
 if(createHash('sha256').update(Buffer.from(a)).digest('hex')!==image.sha256||!b.byteLength||referenceMime(Buffer.from(b))!=='image/jpeg')throw Error('COLLECTION_ARTIFACT_READBACK_FAILED');
}

// Explicit owner-requested map correction. Recorded visit facts remain immutable.
export const footprintCoordinateCorrections=Object.freeze([Object.freeze({
 id:'3f02182d35594e7cc989c7b483ed4266',topicId:'wikipedia:it:10527533',
 name:'Chiesa di San Nicola (Trentinara)',
 recordedP:Object.freeze([15.448582,40.543694]),p:Object.freeze([15.108917,40.399667]),
 articleSource:'https://it.wikipedia.org/wiki/Chiesa_di_San_Nicola_(Trentinara)',
 coordinateSource:'https://commons.wikimedia.org/wiki/Category:San_Nicola_(Trentinara)',
 identitySource:'https://www.comune.trentinara.sa.it/vivere_il_comune/luoghi/luogo_5.html',
 verifiedOn:'2026-10-26',reason:'Wikipedia article coordinates point to the different church in Pertosa; Commons places San Nicola in Trentinara, consistent with the municipal address at Piazza San Nicola.',
})]);

export function correctFootprintCoordinates(rows){return rows.map(row=>{
 const correction=footprintCoordinateCorrections.find(c=>c.id===row.id&&c.topicId===row.topicId&&c.name===row.name&&c.articleSource===row.source&&Array.isArray(row.p)&&c.recordedP.every((v,i)=>Math.abs(v-row.p[i])<1e-8));
 if(!correction)return row;
 return {...row,p:[...correction.p],recordedP:[...row.p],coordinateCorrection:{kind:'owner-verified',verifiedOn:correction.verifiedOn,source:correction.coordinateSource,identitySource:correction.identitySource,reason:correction.reason}};
});}

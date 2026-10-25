// Shared by extraction, cached meal selection, writing material and collections.
// A source URL does not make a sentence fragment a named dish.
export function isDishName(value){
 if(typeof value!=='string')return false;
 const name=value.normalize('NFKC').trim().replace(/\s+/g,' ');
 if(name.length<3||name.length>72||!/^[\p{L}][\p{L}\p{M} ,’'().-]+$/u.test(name))return false;
 if(/^(?:if|when|while|although|because|unless|whether|you|your|we|our|they|their|this|that|these|those|there|here|it|one|some|many|most|all|another|such|a|an|the)(?:\s|$)/i.test(name))return false;
 if(/^(?:wenn (?:du|sie)|si vous|als (?:je|u)|se (?:sei|siete|vuoi)|pokud|jeśli)(?:\s|$)/iu.test(name))return false;
 if(/restaurant|cafe|café|brewery|brewpub|budget|mid.range|splurge|cuisine|local dishes|specialit|https|instructions|system prompt|\b(?:shop|store|venue|hotel|fan|lover|tourist|visitor|rum|bier|wein|beer|wine|korn|köm|schnaps|vin|øl|pivo|piwo)\b/iu.test(name))return false;
 if(/^(?:food|meal|meals|soup|bread|fish|meat|chocolate|cake|dessert|local food|traditional food|regional food)$/i.test(name))return false;
 return true;
}

import overrides from '../../assets/zhuyin-overrides.json' with {type:'json'};
export const readFileSync=()=>JSON.stringify(overrides);

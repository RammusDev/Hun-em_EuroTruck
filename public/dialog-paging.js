(()=>{
 function source(src){return /^\/(?:generated|illustrations|collections|footprints)\/.+\.png$/.test(src)?src+'?view=book':src;}
 function prepare(nodes){for(const node of nodes)for(const image of node.querySelectorAll('img')){image.loading='lazy';image.decoding='async';}}
 window.HunemDialogPaging={prepare,source};
})();

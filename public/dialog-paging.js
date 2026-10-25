(()=>{
 async function prepare(nodes){const images=nodes.flatMap(node=>[...node.querySelectorAll('img')]);await Promise.all(images.map(async image=>{image.loading='eager';if(!image.decode)return;let timer;try{await Promise.race([image.decode().catch(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,2500);})]);}finally{clearTimeout(timer);}}));}
 window.HunemDialogPaging={prepare};
})();

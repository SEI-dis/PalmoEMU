// SPDX-License-Identifier: AGPL-3.0-or-later
// Library artwork is a thumbnail. Keep full-resolution captures unchanged.
export async function coverThumbnail(source){
 const image=new Image();image.src=source;await image.decode();
 const scale=Math.min(1,320/Math.max(image.naturalWidth,image.naturalHeight));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 try{
  const context=canvas.getContext('2d');context.drawImage(image,0,0,canvas.width,canvas.height);
  const png=canvas.toDataURL('image/png'),webp=canvas.toDataURL('image/webp',.9);
  // Some pixel-art screens compress better as PNG; do not force a larger WebP.
  return webp.startsWith('data:image/webp;')&&webp.length<png.length?webp:png;
 }finally{image.removeAttribute('src');canvas.width=canvas.height=1;}
}

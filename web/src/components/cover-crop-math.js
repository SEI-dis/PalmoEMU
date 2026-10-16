// SPDX-License-Identifier: AGPL-3.0-or-later
// Original square-crop geometry. Coordinates are source-image pixels.
const limit=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
export function squareCrop(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new RangeError('Invalid image dimensions');
 return {width,height,x:width/2,y:height/2,zoom:1};
}
export function clampCrop(crop){
 const zoom=limit(crop.zoom,1,4),half=Math.min(crop.width,crop.height)/zoom/2;
 return {...crop,zoom,x:limit(crop.x,half,crop.width-half),y:limit(crop.y,half,crop.height-half)};
}
export function cropBounds(crop){
 const safe=clampCrop(crop),size=Math.min(safe.width,safe.height)/safe.zoom;
 return {x:safe.x-size/2,y:safe.y-size/2,size};
}
// dx/dy are fractions of the visible square, not CSS or device pixels.
export function moveCrop(crop,dx,dy){
 const {size}=cropBounds(crop);return clampCrop({...crop,x:crop.x-dx*size,y:crop.y-dy*size});
}
// Keep the source pixel under the gesture's anchor while it moves or zooms.
export function zoomCrop(crop,zoom,from={x:.5,y:.5},to=from){
 const old=cropBounds(crop),next=clampCrop({...crop,zoom}),size=cropBounds(next).size;
 return clampCrop({...next,x:old.x+from.x*old.size+(.5-to.x)*size,y:old.y+from.y*old.size+(.5-to.y)*size});
}

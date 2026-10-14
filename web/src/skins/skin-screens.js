// SPDX-License-Identifier: AGPL-3.0-or-later
// Present imported screen layers without changing the emulator's state/screenshot canvas.
import {skinSize} from './skin-format.js';
import {observeVideo} from '../rendering/video.js';
const ns='http://www.w3.org/2000/svg';
let sequence=0;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function screenTransform(filters,ratio=1){
 const matrix=new DOMMatrix();
 for(const {name,parameters:p}of filters||[])if(name==='CIAffineTransform'){
  const t=p.inputTransform||{},scale=t.scale||{},translate=t.translation||{};
  matrix.translateSelf(clamp(t.translateX??translate.x??0,-4096,4096)*ratio,clamp(-(t.translateY??translate.y??0),-4096,4096)*ratio);
  matrix.rotateSelf(-(t.rotation??0));matrix.scaleSelf(clamp(t.scaleX??scale.x??1,-16,16),clamp(t.scaleY??scale.y??1,-16,16));
 }
 // Bound cumulative transforms as well as individual parameters.
 for(const key of ['a','b','c','d'])matrix[key]=clamp(matrix[key],-16,16);
 matrix.e=clamp(matrix.e,-8192,8192);matrix.f=clamp(matrix.f,-8192,8192);
 return matrix;
}
function svgNode(name,attributes){const n=document.createElementNS(ns,name);for(const[k,v]of Object.entries(attributes))n.setAttribute(k,String(v));return n;}
function filterLayer(element,filters,ratio,sourceWidth){
 const css=[],matrix=screenTransform(filters,ratio),svg=svgNode('svg',{width:0,height:0,'aria-hidden':true}),defs=svgNode('defs',{});svg.append(defs);
 for(const {name,parameters:p}of filters||[]){
  const n=(key,fallback,min=-16,max=16)=>clamp(p[key]??fallback,min,max);
  if(name==='CIAffineTransform'){
   // Geometry is also shared with the NDS touch target.
  }else if(name==='CIColorControls')css.push(`saturate(${n('inputSaturation',1,0)})`,`brightness(${1+n('inputBrightness',0,-1,1)})`,`contrast(${n('inputContrast',1,0)})`);
  else if(['CIGaussianBlur','CIBoxBlur','CIDiscBlur'].includes(name))css.push(`blur(${n('inputRadius',10,0,64)*element._outputWidth/sourceWidth*ratio}px)`);
  else if(name==='CIColorInvert')css.push('invert(1)');
  else if(name==='CISepiaTone')css.push(`sepia(${n('inputIntensity',1,0,1)})`);
  else if(name==='CIExposureAdjust')css.push(`brightness(${2**n('inputEV',0,-8,8)})`);
  else if(name==='CIHueAdjust')css.push(`hue-rotate(${n('inputAngle',0,-100,100)}rad)`);
  else if(['CIGammaAdjust','CIColorMatrix','CIColorMonochrome','CIBloom'].includes(name)){
   const id='skin-filter-'+(++sequence),f=svgNode('filter',{id,'color-interpolation-filters':'sRGB'});defs.append(f);
   if(name==='CIBloom'){f.setAttribute('x','-100%');f.setAttribute('y','-100%');f.setAttribute('width','300%');f.setAttribute('height','300%');f.append(svgNode('feGaussianBlur',{stdDeviation:n('inputRadius',10,0,64)*element._outputWidth/sourceWidth*ratio,result:'bloom'}),svgNode('feComposite',{in:'SourceGraphic',in2:'bloom',operator:'arithmetic',k1:0,k2:1,k3:n('inputIntensity',.5,0,1),k4:0}));}
   else if(name==='CIColorMonochrome'){const color=p.inputColor||{},intensity=n('inputIntensity',1,0,1),rows=['r','g','b'].map((key,i)=>[.2126,.7152,.0722].map((l,j)=>l*clamp(color[key]??128,0,255)/255*intensity+(i===j?1-intensity:0)).concat(0,0));f.append(svgNode('feColorMatrix',{type:'matrix',values:rows.flat().concat(0,0,0,1,0).join(' ')}));}
   else if(name==='CIGammaAdjust'){const transfer=svgNode('feComponentTransfer',{});for(const channel of ['R','G','B'])transfer.append(svgNode('feFunc'+channel,{type:'gamma',amplitude:1,exponent:n('inputPower',1,.01,8),offset:0}));f.append(transfer);}
   else{const rows=['R','G','B','A'].map((c,i)=>{const v=p['input'+c+'Vector']||{},bias=p.inputBiasVector||{};return ['x','y','z','w'].map((k,j)=>clamp(v[k]??(i===j?1:0),-16,16)).concat(clamp(bias[['x','y','z','w'][i]]??0,-16,16));});f.append(svgNode('feColorMatrix',{type:'matrix',values:rows.flat().join(' ')}));}
   css.push(`url(#${id})`);
  }
 }
 element.style.filter=css.join(' ');element.style.transform=matrix.toString();
 return {svg,matrix};
}
export function mountSkinScreens(host,engine,rep,system,{swap=false,ratio=1}={}){
 const sources=engine.screens||[engine.canvas],originals=engine.display?[engine.display]:sources;
 const layerHost=document.createElement('div');layerHost.className='imported-screens';host.append(layerHost);host.dataset.imported='true';
 originals.forEach(el=>el.classList.add('skin-source'));
 const [nativeWidth,nativeHeight]=skinSize[system],map=rep.mappingSize,cleanups=[];
 const layers=rep.screens.map(s=>{
  const f=s.outputFrame,crop=s.inputFrame||{x:0,y:0,width:nativeWidth,height:nativeHeight};
  const canvas=document.createElement('canvas');canvas.className='imported-screen';canvas._outputWidth=f.width;
  canvas.style.cssText=`left:${f.x/map.width*100}%;top:${f.y/map.height*100}%;width:${f.width/map.width*100}%;height:${f.height/map.height*100}%;`;
  canvas.width=Math.max(1,Math.ceil(Math.min(crop.width,1024)));canvas.height=Math.max(1,Math.ceil(Math.min(crop.height,1024)));canvas.setAttribute('aria-hidden','true');
  const effect=filterLayer(canvas,s.filters,ratio,crop.width);layerHost.append(effect.svg,canvas);
  return{canvas,crop,ctx:canvas.getContext('2d'),frame:f,matrix:effect.matrix};
 });
 function draw(){
  for(const layer of layers){
   const {canvas,ctx,crop}=layer;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
   sources.forEach((source,index)=>{
    const logical=swap&&sources.length===2?1-index:index,sh=nativeHeight/sources.length,top=logical*sh;
    const x=Math.max(0,crop.x),y=Math.max(top,crop.y),right=Math.min(nativeWidth,crop.x+crop.width),bottom=Math.min(top+sh,crop.y+crop.height);
    if(right<=x||bottom<=y)return;
    ctx.drawImage(source,x/nativeWidth*source.width,(y-top)/sh*source.height,(right-x)/nativeWidth*source.width,(bottom-y)/sh*source.height,(x-crop.x)/crop.width*canvas.width,(y-crop.y)/crop.height*canvas.height,(right-x)/crop.width*canvas.width,(bottom-y)/crop.height*canvas.height);
   });
  }
 }
 // NDS updates both source canvases sequentially; subscribe only to the last one.
 cleanups.push(observeVideo(sources.at(-1),draw));draw();
 return()=>{cleanups.forEach(fn=>fn());layerHost.remove();originals.forEach(el=>el.classList.remove('skin-source'));delete host.dataset.imported;};
}

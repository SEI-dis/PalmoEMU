// SPDX-License-Identifier: AGPL-3.0-or-later
// Data-only implementation of the published Delta / Manic skin formats.
// https://noah978.gitbook.io/delta-docs/skins
// https://manicemu.site/guides/homemade-skins/
import {tr} from '../i18n/index.js';
export const skinSize={gba:[240,160],gb:[160,144],gbc:[160,144],nes:[256,240],snes:[256,224],md:[320,224],nds:[256,384],'3ds':[400,480]};
export const gameInputs=new Set(['a','b','x','y','c','z','l','r','l1','r1','start','select','up','down','left','right']);
export const skinActions=new Set(['menu','quickSave','quickLoad','fastForward','fastForward2x','fastForward3x','fastForward4x','toggleFastForward','reverseScreens','volume','saveStates','cheatCodes','skins','filters','screenshot','haptics','controllers','restart','quit','toggleControlls','resolution','rewind']);
const aliases={mode:'select',analogStickUp:'up',analogStickDown:'down',analogStickLeft:'left',analogStickRight:'right'};
export function skinNumber(value,min,max){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(tr('スキンの数値が範囲外です。'));return value;}
export function skinRect(r){if(!r)throw Error(tr('スキンの位置が指定されていません。'));return{x:skinNumber(r.x,-8192,8192),y:skinNumber(r.y,-8192,8192),width:skinNumber(r.width,.01,8192),height:skinNumber(r.height,.01,8192)};}
export function chooseRepresentation(skin,width,height){
 const orientation=width>height?'landscape':'portrait',variants=skin.variants?.filter(v=>v.orientation===orientation);
 if(!variants?.length)return skin[orientation]||skin.portrait||skin.landscape;
 const tablet=Math.min(width,height)>=600;
 // Choose the closest aspect ratio within the device family, including split view.
 return [...variants].sort((a,b)=>{
  const score=v=>Math.abs(Math.log((v.mappingSize.width/v.mappingSize.height)/(width/height)))+(v.device===(tablet?'ipad':'iphone')?0:.65);
  return score(a)-score(b);
 })[0];
}
export function normalizeSkin(info,system,asset){
 const warnings=new Set(),variants=[];
 const input=value=>{if(typeof value!=='string'||value.length>64)throw Error(tr('スキンのボタン設定が正しくありません。'));const key=aliases[value]||value;if(!gameInputs.has(key)&&!skinActions.has(key))warnings.add(tr`未対応の操作：${key}`);return key;};
 const edges=(value={})=>Object.fromEntries(['top','right','bottom','left'].map(k=>[k,skinNumber(value[k]??0,-256,256)]));
 const parse=(r,device,trait,orientation)=>{
  const mappingSize={width:skinNumber(r.mappingSize?.width,32,8192),height:skinNumber(r.mappingSize?.height,32,8192)};
  const assets=Object.fromEntries(Object.entries(r.assets||{}).map(([k,v])=>[k.toLowerCase(),v]));
  const background=assets.resizable||assets.large||assets.medium||assets.small;
  const rep={device,trait,orientation,mappingSize,assets:{resizable:background?asset(background):''},items:[],screens:[]};
  if(!Array.isArray(r.items)||r.items.length>128)throw Error(tr('スキンのボタン数が多すぎるか、設定が正しくありません。'));
  rep.items=r.items.map(item=>{
   let inputs=item.inputs,touch=false;
   if(typeof inputs==='string')inputs=[inputs];
   if(Array.isArray(inputs)){if(!inputs.length||inputs.length>16)throw Error(tr('スキンのボタン設定が正しくありません。'));inputs=inputs.map(input);if(inputs.filter(k=>!gameInputs.has(k)).length>1){warnings.add(tr('複数の機能が割り当てられたボタンは無効です。'));inputs=['unsupportedMultipleActions'];}}
   else if(inputs&&inputs.x==='touchScreenX'&&inputs.y==='touchScreenY'){touch=true;inputs={x:'touchScreenX',y:'touchScreenY'};}
   else{if(!inputs||Object.keys(inputs).some(k=>!['up','down','left','right'].includes(k)))throw Error(tr('スキンの方向キー設定が正しくありません。'));inputs=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,input(v)]));}
   const frame=skinRect(item.frame),result={inputs,frame,placement:item.placement==='app'?'app':'controller',extendedEdges:edges({...r.extendedEdges,...item.extendedEdges}),touch,opacity:skinNumber(item.opacity??1,0,1)};
   if(item.asset){result.asset={};for(const key of ['normal','selected'])if(item.asset[key])result.asset[key]=asset(item.asset[key]);}
   if(item.animation)result.animation={begin:skinRect(item.animation.begin),end:skinRect(item.animation.end)};
   if(item.thumbstick)result.thumbstick={name:asset(item.thumbstick.name),width:skinNumber(item.thumbstick.width,1,4096),height:skinNumber(item.thumbstick.height,1,4096)};
   result.selfRetracting=item.selfRetracting!==false;
   return result;
  });
  let screens=r.screens??(r.gameScreenFrame?[{outputFrame:r.gameScreenFrame}]:[]);
  if(!Array.isArray(screens)||screens.length>12)throw Error(tr('スキンの画面数が多すぎます。'));
  if(!screens.length||screens.some(s=>s.placement==='app')){
   // Delta's split-view skins can contain controls only. Reserve a display above them.
   const [w,h]=skinSize[system],appScreens=screens.filter(s=>s.placement==='app'),appHeight=appScreens.length===1?(appScreens[0].inputFrame?.height||h):h,screenHeight=mappingSize.width*appHeight/w;
   rep.mappingSize={width:mappingSize.width,height:mappingSize.height+screenHeight};
   rep.artFrame={x:0,y:screenHeight,...mappingSize};
   const appFrame=f=>({x:(f?.x||0)*mappingSize.width,y:(f?.y||0)*screenHeight,width:(f?.width??1)*mappingSize.width,height:(f?.height??1)*screenHeight});
   rep.items.forEach(item=>{if(item.placement==='app')item.frame=appFrame(item.frame);else item.frame.y+=screenHeight;});
   screens=screens.length?screens.map(s=>({...s,outputFrame:s.placement==='app'?appFrame(s.outputFrame):{...skinRect(s.outputFrame),y:s.outputFrame.y+screenHeight}})):[{outputFrame:{x:0,y:0,width:mappingSize.width,height:screenHeight}}];
  }
  rep.screens=screens.map(s=>({outputFrame:skinRect(s.outputFrame),...(s.inputFrame?{inputFrame:skinRect(s.inputFrame)}:{}),filters:normalizeFilters(s.filters||[],warnings)}));
  return rep;
 };
 for(const [d,source] of Object.entries(info.representations||{})){
  const device=d.toLowerCase();if(!['iphone','ipad'].includes(device))continue;
  const traits=source.portrait||source.landscape?{standard:source}:source;
  for(const [trait,orientations]of Object.entries(traits))for(const orientation of ['portrait','landscape']){
   if(!orientations?.[orientation])continue;if(variants.length>=24)throw Error(tr('スキンのレイアウト数が多すぎます。'));
   variants.push(parse(orientations[orientation],device,trait,orientation));
  }
 }
 if(!variants.length)throw Error(tr('縦画面・横画面の設定が見つかりません。'));
 return {variants,portrait:variants.find(v=>v.orientation==='portrait'),landscape:variants.find(v=>v.orientation==='landscape'),warnings:[...warnings]};
}
const supportedFilters=new Set(['CIColorControls','CIGaussianBlur','CIBoxBlur','CIDiscBlur','CIColorInvert','CISepiaTone','CIExposureAdjust','CIHueAdjust','CIGammaAdjust','CIColorMatrix','CIAffineTransform','CIColorMonochrome','CIBloom']);
function normalizeFilters(filters,warnings){
 if(!Array.isArray(filters)||filters.length>12)throw Error(tr('スキンのフィルター数が多すぎます。'));
 return filters.flatMap(f=>{
  if(typeof f.name!=='string'||f.name.length>80)throw Error(tr('フィルター名が正しくありません。'));
  if(!supportedFilters.has(f.name)){warnings.add(tr`未対応の効果：${f.name}（効果なしで表示）`);return [];}
  if(['CIBoxBlur','CIDiscBlur'].includes(f.name))warnings.add(tr`${f.name} はガウスぼかしで表示します。`);
  const sanitize=(v,depth=0)=>{
   if(typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v))v=Number(v);
   if(typeof v==='number')return skinNumber(v,-8192,8192);
   if(depth>2||!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>16)throw Error(tr('フィルターの数値設定が正しくありません。'));
   return Object.fromEntries(Object.entries(v).map(([k,n])=>[k,sanitize(n,depth+1)]));
  };
  const parameters=sanitize(f.parameters||{});
  if(typeof parameters!=='object')throw Error(tr('フィルターの設定が正しくありません。'));
  const vectors=new Set(['inputColor','inputRVector','inputGVector','inputBVector','inputAVector','inputBiasVector']);
  for(const [key,value]of Object.entries(parameters)){
   if(key==='inputTransform'){
    if(!value||typeof value!=='object')throw Error(tr('画面の変形設定が正しくありません。'));
    for(const [k,v]of Object.entries(value)){
     if(['scale','translation'].includes(k)){if(!v||typeof v!=='object'||Object.values(v).some(n=>typeof n!=='number'))throw Error(tr('画面の変形設定が正しくありません。'));}
     else if(typeof v!=='number')throw Error(tr('画面の変形設定が正しくありません。'));
    }
   }else if(vectors.has(key)){if(!value||typeof value!=='object'||Object.values(value).some(n=>typeof n!=='number'))throw Error(tr('色の設定が正しくありません。'));}
   else if(typeof value!=='number')throw Error(tr('フィルターの数値設定が正しくありません。'));
  }
  return [{name:f.name,parameters}];
 });
}

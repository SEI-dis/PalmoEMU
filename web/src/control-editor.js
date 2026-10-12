/* Based on ManicEMU FlexSkinSettingViewController / FlexItemView.
   Copyright © 2025–2026 Manic EMU. Created by Daiuno.
   Modified for Web 2026-10-09. See sources/manicemu-ui/README.md. */
// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from './i18n/index.js';
import {builtinLayout} from './skin-art.js';
import {controls,normalizedPosition,clamp} from './control-layout.js';
import {escapeHTML as esc,icon} from './shared.js';
import {mountLayoutAlignment} from './control-alignment.js';

export function mountControlEditor(root,{skin,layout,shared,inherits,game,orientation,viewport,onSave,onCancel}){
 const copy=value=>structuredClone(value||{});
 let draft=copy(layout),useShared=!!inherits,mode='buttons',selected='dpad',lastButton='dpad',lastScreen=skin.system==='nds'?'screen-main':'screen',rep,items,drag=null,disposed=false,saving=false;
 const pointers=new Map();
 root.innerHTML=tr`<div class="control-editor"><div class="edit-stage"><div class="edit-preview" aria-label="画面とボタンの配置"></div></div><div class="edit-tools"><div class="segmented edit-mode" role="group" aria-label="編集する対象"><button data-edit-mode="screen">${icon('image')}画面</button><button data-edit-mode="buttons">${icon('game')}ボタン</button></div><div class="edit-inspector"><p class="edit-help">ドラッグで移動・丸いハンドルでサイズ変更</p><div class="edit-group"><div class="edit-field"><span>向き</span><div class="segmented edit-orientation" role="group" aria-label="編集する向き"><button data-edit-orientation="portrait">縦</button><button data-edit-orientation="landscape">横</button></div></div><label class="edit-field" id="edit-selection-row"><span id="edit-selection-label">ボタン</span><select id="edit-selection"></select></label><label class="edit-field" for="edit-size"><span>サイズ <output id="edit-size-value"></output></span><input id="edit-size" type="range" min="50" max="200" step="1" aria-label="サイズ"></label><label class="edit-field" for="edit-opacity" id="edit-opacity-row"><span>透明度 <output id="edit-opacity-value"></output></span><input id="edit-opacity" type="range" min="0" max="80" step="5"></label></div><div class="edit-alignment"></div><div class="edit-group edit-reset-group"><button id="edit-reset">${icon('reload')}<span>初期配置に戻す<small id="edit-reset-scope"></small></span></button>${game?tr`<button id="edit-inherit">${icon('layers')}<span>機種の配置を使う</span></button>`:''}</div><p class="edit-help" id="edit-screen-note" hidden>${skin.system==='nds'?tr('メイン画面とサブ画面を個別に移動・拡大縮小できます。'):''}画面の縦横比は維持されます。ボタンは画面の手前に重なり、ボタンの透明度で見え方を調整できます。</p></div><div class="edit-footer"><p id="edit-status" role="status" aria-live="polite"></p><div class="sheet-actions"><button class="secondary" id="edit-cancel">キャンセル</button><button class="primary" id="edit-save">保存</button></div></div></div></div>`;
 const $=s=>root.querySelector(s),host=$('.edit-preview'),stage=$('.edit-stage'),select=$('#edit-selection'),opacitySlider=$('#edit-opacity'),sizeSlider=$('#edit-size'),status=$('#edit-status');
 const setStatus=()=>{status.textContent=useShared&&game?tr('機種の配置を使用中'):game?tr('このゲームの配置'):tr('この機種の共通配置');};
 const edit=(id,change)=>{useShared=false;draft[orientation]??={};draft[orientation][id]={...draft[orientation][id],...change};setStatus();};
 const alignment=mountLayoutAlignment($('.edit-alignment'),host,{geometry:()=>({items:items||[],map:rep?.mappingSize,selected,zoom:host.clientWidth/(rep?.mappingSize.width||1)}),onPosition:(item,{x,y})=>{edit(item.id,normalizedPosition(item.frame,rep.mappingSize,x,y));draw();}});
 const cancelDrag=()=>{drag=null;pointers.clear();alignment.clear();};
 const targets=()=>items.filter(i=>selected==='all'?!i.screen:i.id===selected);
 const maxScale=item=>Math.min(2,rep.mappingSize.width/item.baseFrame.width,rep.mappingSize.height/item.baseFrame.height);
 function choose(id){
  selected=id;if(items.find(i=>i.id===id)?.screen)lastScreen=id;else lastButton=id;select.value=id;
  const picked=targets(),opacities=picked.map(i=>i.opacity??1),sizes=picked.map(i=>i.scale??1);
  opacitySlider.value=Math.round((1-(opacities[0]??1))*100);$('#edit-opacity-value').textContent=opacities.some(v=>Math.abs(v-opacities[0])>.001)?tr('個別'):opacitySlider.value+'%';
  sizeSlider.min=mode==='screen'?25:50;sizeSlider.max=Math.floor(Math.min(...picked.map(maxScale))*100);sizeSlider.value=Math.round((sizes[0]??1)*100);
  $('#edit-size-value').textContent=sizes.some(v=>Math.abs(v-sizes[0])>.001)?tr('個別'):Math.round((sizes[0]??1)*100)+'%';
  host.querySelectorAll('[data-edit-control]').forEach(b=>{const active=(mode==='screen')===b.classList.contains('edit-screen');b.classList.toggle('edit-inactive',!active);b.tabIndex=active?0:-1;b.setAttribute('aria-pressed',String(b.dataset.editControl===id));});
  alignment.update();
  const handle=$('.edit-resize'),item=items.find(i=>i.id===id);handle.hidden=!item;
  if(item){
   const zoom=host.clientWidth/rep.mappingSize.width,f=item.frame,x=f.x*zoom,y=f.y*zoom,w=f.width*zoom,h=f.height*zoom;
   // A touch-sized handle must not hide a small selected button's drag target.
   const positions=[[x+w+4,y+h+4],[x-34,y+h+4],[x+w+4,y-34],[x-34,y-34]].map(([left,top])=>({left:clamp(left,0,Math.max(0,host.clientWidth-30)),top:clamp(top,0,Math.max(0,host.clientHeight-30))}));
   const position=positions.find(p=>p.left>=x+w||p.left+30<=x||p.top>=y+h||p.top+30<=y)||positions[0];
   handle.style.left=position.left+'px';handle.style.top=position.top+'px';handle.setAttribute('aria-label',item.label+tr('のサイズを変更（ドラッグまたは矢印キー）'));
  }
 }
 function resize(item,wanted,{x,y}={}){
  const scale=clamp(wanted,item.screen ? .25 : .5,maxScale(item)),frame={width:item.baseFrame.width*scale,height:item.baseFrame.height*scale};
  const left=x??item.frame.x+(item.frame.width-frame.width)/2,top=y??item.frame.y+(item.frame.height-frame.height)/2;
  edit(item.id,{scale,...normalizedPosition(frame,rep.mappingSize,left,top)});
 }
 function begin(e,id,kind='move'){
  if(saving||e.button>0)return;
  if(drag&&(drag.id!==id||pointers.size>=2||kind==='resize'))return;
  e.preventDefault();alignment.clear();choose(id);e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const item=items.find(i=>i.id===id),zoom=host.clientWidth/rep.mappingSize.width;
  if(pointers.size===2){const [a,b]=[...pointers.values()];drag={id,kind:'pinch',frame:{...item.frame},scale:item.scale,base:{...item.baseFrame},zoom,distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};}
  else drag={id,kind,frame:{...item.frame},scale:item.scale,base:{...item.baseFrame},zoom,x:e.clientX,y:e.clientY};
 }
 function move(e){
  if(!drag||!pointers.has(e.pointerId))return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const d=drag,item=items.find(i=>i.id===d.id),map=rep.mappingSize;
  if(d.kind==='pinch'){
   const [a,b]=[...pointers.values()];if(!b)return;
   const scale=clamp(d.scale*Math.hypot(b.x-a.x,b.y-a.y)/d.distance,item.screen ? .25 : .5,maxScale(item));
   const x=d.frame.x+(d.frame.width-d.base.width*scale)/2+((a.x+b.x)/2-d.mid.x)/d.zoom,y=d.frame.y+(d.frame.height-d.base.height*scale)/2+((a.y+b.y)/2-d.mid.y)/d.zoom;
   resize(item,scale,{x,y});
  }else if(d.kind==='resize'){
   const dx=(e.clientX-d.x)/d.zoom,dy=(e.clientY-d.y)/d.zoom,scale=d.scale+(dx*d.base.width+dy*d.base.height)/(d.base.width**2+d.base.height**2);
   resize(item,scale,{x:d.frame.x,y:d.frame.y});
  }else{
   const {x,y}=alignment.move(item,{x:d.frame.x+(e.clientX-d.x)/d.zoom,y:d.frame.y+(e.clientY-d.y)/d.zoom},{free:e.altKey});
   edit(d.id,normalizedPosition(d.frame,map,x,y));
  }
  draw();
 }
 function end(e){
  if(!pointers.delete(e.pointerId)||!drag)return;
  if(!pointers.size){drag=null;alignment.clear();return;}
  const p=[...pointers.values()][0],item=items.find(i=>i.id===drag.id);drag={id:item.id,kind:'move',frame:{...item.frame},scale:item.scale,base:{...item.baseFrame},zoom:host.clientWidth/rep.mappingSize.width,x:p.x,y:p.y};
 }
 function wirePointer(button,id,kind){
  button.onpointerdown=e=>begin(e,typeof id==='function'?id():id,kind);button.onpointermove=move;
  button.onpointerup=end;button.onpointercancel=end;button.onlostpointercapture=end;
 }
 function draw(){
  if(disposed)return;
  const size=viewport(),wide=orientation==='landscape',w=wide?Math.max(size.width,size.height):Math.min(size.width,size.height),h=wide?Math.min(size.width,size.height):Math.max(size.width,size.height);
  rep=builtinLayout(skin,w,h,draft[orientation]);
  items=[...controls(rep),...rep.screens.map(s=>({id:s.id||'screen',label:s.label||tr('ゲーム画面'),screen:true,frame:s.outputFrame,baseFrame:s.baseFrame,scale:s.scale}))];
  const map=rep.mappingSize,zoom=Math.max(.01,Math.min(stage.clientWidth/map.width,stage.clientHeight/map.height));
  host.style.width=map.width*zoom+'px';host.style.height=map.height*zoom+'px';host.style.backgroundImage=`url("${skin.images.responsive}")`;host.dataset.editMode=mode;
  if(!host.querySelector('[data-edit-control]')){
   host.innerHTML=items.map(i=>tr`<button class="edit-control ${i.screen?'edit-screen':''}" data-edit-control="${i.id}" aria-label="${esc(i.label)}の位置" title="${esc(i.label)}（方向キーでも移動できます）"><span class="${i.screen?'skin-mini-screen':`edit-art ${i.tool?'edit-tool':''}`}" ${i.tool?`data-control="${i.id}"`:''}>${i.screen?`<span>${esc(i.label)}</span>`:''}</span></button>`).join('')+tr`<button class="edit-resize" aria-label="サイズを変更">${icon('expand')}</button>`;
   host.querySelectorAll('[data-edit-control]').forEach(b=>{
    wirePointer(b,b.dataset.editControl,'move');b.onclick=()=>choose(b.dataset.editControl);
    b.onkeydown=e=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta||saving)return;e.preventDefault();e.stopPropagation();alignment.clear();choose(b.dataset.editControl);const f=items.find(i=>i.id===selected).frame,step=e.shiftKey?10:2;edit(selected,normalizedPosition(f,rep.mappingSize,f.x+delta[0]*step,f.y+delta[1]*step));draw();};
   });
   const handle=$('.edit-resize');wirePointer(handle,()=>selected,'resize');
   handle.onkeydown=e=>{const sign={ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1}[e.key];if(!sign||saving)return;e.preventDefault();e.stopPropagation();const item=items.find(i=>i.id===selected);if(item){resize(item,item.scale+sign*(e.shiftKey ? .1 : .01));draw();}};
  }
  for(const i of items){
   const b=host.querySelector(`[data-edit-control="${i.id}"]`),art=b.firstElementChild,f=i.frame;
   b.style.left=f.x/map.width*100+'%';b.style.top=f.y/map.height*100+'%';b.style.width=f.width/map.width*100+'%';b.style.height=f.height/map.height*100+'%';
   if(i.screen)continue;art.style.opacity=i.opacity??1;if(i.tool){art.textContent=i.tool;art.style.fontSize=Math.max(8,11*zoom*i.scale)+'px';}else art.style.backgroundImage=`url("${skin.images[i.asset.normal]}")`;
  }
  root.querySelectorAll('[data-edit-orientation]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.editOrientation===orientation)));
  root.querySelectorAll('[data-edit-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.editMode===mode)));
  select.innerHTML=(mode==='buttons'?tr('<option value="all">すべてのボタン</option>'):'')+items.filter(i=>!!i.screen===(mode==='screen')).map(i=>`<option value="${i.id}">${esc(i.label)}</option>`).join('');
  $('#edit-selection-label').textContent=mode==='screen'?tr('画面'):tr('ボタン');
  $('#edit-selection-row').hidden=mode==='screen'&&rep.screens.length===1;$('#edit-opacity-row').hidden=mode==='screen';$('#edit-screen-note').hidden=mode!=='screen';
  $('#edit-reset-scope').textContent=(orientation==='portrait'?tr('縦'):tr('横'))+tr('向きの画面とボタン');choose(selected);
 }
 select.onchange=()=>choose(select.value);
 opacitySlider.oninput=()=>{const opacity=clamp((100-Number(opacitySlider.value))/100,.2,1);for(const i of targets())edit(i.id,{opacity});draw();};
 sizeSlider.oninput=()=>{const size=Number(sizeSlider.value)/100;for(const i of targets())resize(i,size);draw();};
 root.querySelectorAll('[data-edit-mode]').forEach(b=>b.onclick=()=>{cancelDrag();mode=b.dataset.editMode;selected=mode==='screen'?lastScreen:lastButton;draw();});
 root.querySelectorAll('[data-edit-orientation]').forEach(b=>b.onclick=()=>{cancelDrag();orientation=b.dataset.editOrientation;draw();});
 $('#edit-reset').onclick=()=>{cancelDrag();useShared=false;draft[orientation]={};setStatus();draw();};
 if(game)$('#edit-inherit').onclick=()=>{cancelDrag();draft=copy(shared);useShared=true;setStatus();draw();};
 $('#edit-cancel').onclick=()=>{if(!saving)onCancel();};
 $('#edit-save').onclick=async()=>{
  if(saving)return;saving=true;cancelDrag();root.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);status.textContent=tr('保存中…');
  try{await onSave(game&&useShared?null:copy(draft));}
  catch(e){if(!disposed){status.textContent=e.name==='QuotaExceededError'?tr('容量が不足しているため保存できません。'):tr('保存できませんでした。もう一度お試しください。');root.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);}}
  finally{saving=false;}
 };
 const observer=new ResizeObserver(()=>{cancelDrag();draw();});observer.observe(stage);setStatus();draw();
 return ()=>{disposed=true;cancelDrag();observer.disconnect();};
}

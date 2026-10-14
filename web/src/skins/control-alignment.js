// SPDX-License-Identifier: AGPL-3.0-or-later
// Original Web layout aids. Coordinates use the skin mapping, never preview pixels.
import {tr} from '../i18n/index.js';
import {clamp} from './control-layout.js';
import {escapeHTML as esc} from '../shared.js';

const center=(frame,axis)=>frame[axis]+frame[axis==='x'?'width':'height']/2;
const peers=(items,item)=>items.filter(other=>other.id!==item.id&&!!other.screen===!!item.screen);

export function alignedPosition(item,reference,map,action){
 const f=item.frame,r=reference?.frame;
 let {x,y}=f;
 if(action==='center-x')x=(map.width-f.width)/2;
 if(action==='center-y')y=(map.height-f.height)/2;
 if(r&&action==='level')y=center(r,'y')-f.height/2;
 if(r&&action==='mirror'){x=map.width-center(r,'x')-f.width/2;y=center(r,'y')-f.height/2;}
 return {x:clamp(x,0,map.width-f.width),y:clamp(y,0,map.height-f.height)};
}

export function snapPosition(item,items,map,position,{step=16,threshold=6}={}){
 const result={},guides=[],others=peers(items,item);
 for(const axis of ['x','y']){
  const size=axis==='x'?'width':'height',length=item.frame[size],limit=map[size]-length;
  const raw=clamp(position[axis],0,limit),candidates=[];
  const add=(value,offset,kind)=>{
   const coordinate=value-offset,distance=Math.abs(coordinate-raw);
   if(coordinate>=0&&coordinate<=limit&&distance<=threshold)candidates.push({coordinate,distance,value,kind});
  };
  add(map[size]/2,length/2,'center');add(0,0,'edge');add(map[size],length,'edge');
  for(const other of others){
   const f=other.frame;
   add(center(f,axis),length/2,'peer');
   for(const value of [f[axis],f[axis]+f[size]])for(const offset of [0,length])add(value,offset,'peer');
   if(axis==='x')add(map.width-center(f,'x'),length/2,'mirror');
  }
  // Semantic alignments take precedence over the grid inside a small capture radius.
  candidates.sort((a,b)=>a.distance-b.distance);
  const best=candidates[0];
  result[axis]=best?best.coordinate:clamp(Math.round(raw/step)*step,0,limit);
  if(best){guides.push({axis,value:best.value,kind:best.kind});if(best.kind==='mirror')guides.push({axis:'x',value:map.width/2,kind:'center'});}
 }
 return {...result,guides};
}

export function mountLayoutAlignment(root,host,{geometry,onPosition}){
 let grid=true,snap=true,step=16,guides=[],reference='',previousSelection='';
 root.innerHTML=tr`<div class="edit-group"><div class="edit-aid-toggles"><label><input id="edit-grid" type="checkbox" checked>グリッド</label><label><input id="edit-snap" type="checkbox" checked>吸着</label></div><label class="edit-field"><span>グリッド間隔</span><select id="edit-grid-step"><option value="8">細かい</option><option value="16" selected>標準</option><option value="32">広い</option></select></label><div class="edit-align-actions"><button data-align="center-x">横中央</button><button data-align="center-y">縦中央</button></div><label class="edit-field"><span>基準</span><select id="edit-align-reference" aria-label="配置の基準"></select></label><div class="edit-align-actions"><button data-align="level">高さをそろえる</button><button data-align="mirror" title="基準と同じ高さで、中央線の反対側に配置">左右対称にする</button></div></div><p class="edit-help">近づけると中央・端・ほかのボタンに吸着します。細かく動かすときは吸着をオフに。</p>`;
 const $=s=>root.querySelector(s),referenceSelect=$('#edit-align-reference');
 function paint(){
  const {map,zoom}=geometry();if(!map)return;
  let layer=host.querySelector('.edit-guides');
  if(!layer){layer=document.createElement('div');layer.className='edit-guides';layer.setAttribute('aria-hidden','true');host.append(layer);}
  layer.classList.toggle('show-grid',grid);layer.style.setProperty('--grid-step',step*zoom+'px');
  layer.innerHTML=(grid?'<i class="edit-center-axis axis-x"></i><i class="edit-center-axis axis-y"></i>':'')+guides.map(g=>`<i class="edit-snap-guide axis-${g.axis}" data-guide="${g.kind}" style="${g.axis==='x'?'left':'top'}:${g.value/map[g.axis==='x'?'width':'height']*100}%"></i>`).join('');
 }
 function update(){
  const {items,selected}=geometry(),item=items.find(i=>i.id===selected),others=item?peers(items,item):[];
  const pair={l:'r',r:'l','quick-save':'quick-load','quick-load':'quick-save',select:'start',start:'select'}[selected];
  if(!others.some(i=>i.id===reference)||(selected!==previousSelection&&pair)){
   reference=(others.find(i=>i.id===pair)||others[0])?.id||'';
  }
  previousSelection=selected;
  referenceSelect.innerHTML=others.map(i=>`<option value="${i.id}">${esc(i.label)}</option>`).join('')||'<option value="">—</option>';
  referenceSelect.value=reference;referenceSelect.disabled=!others.length;
  referenceSelect.closest('label').hidden=!others.length;
  root.querySelector('[data-align=mirror]').parentElement.hidden=!others.length;
  root.querySelectorAll('[data-align]').forEach(button=>{button.disabled=!item||(['level','mirror'].includes(button.dataset.align)&&!others.length);});
  paint();
 }
 $('#edit-grid').onchange=e=>{grid=e.target.checked;paint();};
 $('#edit-snap').onchange=e=>{snap=e.target.checked;clear();};
 $('#edit-grid-step').onchange=e=>{step=Number(e.target.value);clear();};
 referenceSelect.onchange=()=>{reference=referenceSelect.value;};
 root.querySelectorAll('[data-align]').forEach(button=>button.onclick=()=>{
  const {items,map,selected}=geometry(),item=items.find(i=>i.id===selected);if(!item)return;
  clear();onPosition(item,alignedPosition(item,items.find(i=>i.id===reference),map,button.dataset.align));
 });
 function clear(){guides=[];paint();}
 return {update,clear,move(item,position,{free=false}={}){
  const {items,map,zoom}=geometry();
  if(!snap||free){guides=[];return position;}
  const result=snapPosition(item,items,map,position,{step,threshold:Math.min(step/2,6/zoom)});guides=result.guides;return result;
 }};
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import Sortable from '../../vendor/sortable/src/Sortable.js';
import AutoScroll from '../../vendor/sortable/plugins/AutoScroll/AutoScroll.js';

Sortable.mount(new AutoScroll());

export function enableMenuDrag(groups, scrollPanel, onReorder){
 const instances=[];
 let active=true;
 for(const group of groups){
  if(group.children.length<2)continue;
  const instance=new Sortable(group,{
   draggable:'.option-reorder',
   handle:'.order-grip',
   forceFallback:true,
   fallbackTolerance:4,
   scroll:scrollPanel,
   bubbleScroll:false,
   ghostClass:'order-placeholder',
   onEnd:({from,to,oldIndex,newIndex})=>{
    if(active&&from===to&&oldIndex!==newIndex)onReorder(group);
   }
  });
  group.classList.add('drag-ready');
  instances.push(instance);
 }
 return ()=>{active=false;for(const instance of instances)instance.destroy();};
}

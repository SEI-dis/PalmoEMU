// SPDX-License-Identifier: AGPL-3.0-or-later
// Keep first-use gestures while IndexedDB/settings recovery initializes.
// This gate is installed synchronously before the first startup await.
export function holdStartupInputs(){
 let pending=[];
 const remember=(kind,value)=>{pending=pending.filter(item=>item.kind!==kind);pending.push({kind,value});};
 const click=event=>{
  const tab=event.target.closest?.('[data-tab]');if(!tab)return;
  event.preventDefault();event.stopImmediatePropagation();remember('tab',tab.dataset.tab);
 };
 const change=event=>{
  if(event.target.id!=='rom-input')return;
  event.stopImmediatePropagation();remember('files',[...event.target.files]);event.target.value='';
 };
 const drop=event=>{
  if(!event.dataTransfer?.types.includes('Files'))return;
  event.preventDefault();event.stopImmediatePropagation();remember('files',[...event.dataTransfer.files]);
 };
 const dragover=event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();};
 document.documentElement.setAttribute('aria-busy','true');
 document.addEventListener('click',click,true);document.addEventListener('change',change,true);
 window.addEventListener('drop',drop,true);window.addEventListener('dragover',dragover,true);
 return async({onTab,onFiles})=>{
  document.removeEventListener('click',click,true);document.removeEventListener('change',change,true);
  window.removeEventListener('drop',drop,true);window.removeEventListener('dragover',dragover,true);
  document.documentElement.removeAttribute('aria-busy');
  const actions=pending;pending=[];
  for(const {kind,value} of actions){if(kind==='tab')onTab(value);else if(value.length)await onFiles(value);}
 };
}

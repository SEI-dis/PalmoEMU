// SPDX-License-Identifier: AGPL-3.0-or-later
// Original SVG primitives shared by the six single-screen controller skins.
import {skinProfile,skinTheme} from './skin-profiles.js';
const svg=(w,h,body)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
const text=(x,y,value,size,fill,extra='')=>`<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size}" fill="${fill}" ${extra}>${value}</text>`;
const gradient=(id,color)=>`<linearGradient id="${id}" x2=".3" y2="1"><stop stop-color="#fff" stop-opacity=".24"/><stop offset=".38" stop-color="${color}"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>`;
function roundButton(color,key,concave=false){
 return svg(88,88,`<defs>${gradient('shine',color)}</defs><circle cx="44" cy="46" r="42" fill="#11141b" fill-opacity=".65"/><circle cx="44" cy="42" r="36" fill="${color}" stroke="#10131c" stroke-opacity=".8" stroke-width="2"/><circle cx="44" cy="42" r="35" fill="url(#shine)"/><circle cx="44" cy="42" r="29" fill="none" stroke="#fff" stroke-opacity="${concave?'.3':'.12'}"/><path d="M22 22a31 31 0 0 1 40-2" fill="none" stroke="#fff" stroke-opacity=".3" stroke-linecap="round" stroke-width="2"/>${text(44,53,key,30,key==='B'&&color==='#e1b943'?'#453708':'#fff','font-weight="600"')}`);
}
function dpad(profile){
 const rounded=['six','advance'].includes(profile.design),cross='M47 9h50q5 0 5 5v28h28q5 0 5 5v50q0 5-5 5h-28v28q0 5-5 5H47q-5 0-5-5v-28H14q-5 0-5-5V47q0-5 5-5h28V14q0-5 5-5Z';
 return svg(144,144,`<defs>${gradient('pad','#363a3f')}</defs>${rounded?'<circle cx="72" cy="72" r="71" fill="#14161b" stroke="#a7aab3" stroke-opacity=".4"/><circle cx="72" cy="72" r="65" fill="#292c32"/>':''}<path d="${cross}" fill="#14171a" stroke="#111319" stroke-width="7"/><path d="${cross}" fill="#383c40" stroke="#959ba2" stroke-width="1.2"/><path d="${cross}" fill="url(#pad)"/><circle cx="72" cy="72" r="16" fill="#161a21" fill-opacity=".35"/><g fill="#c9cbd0" fill-opacity=".68"><path d="m72 24-8 11h16Z"/><path d="m72 120-8-11h16Z"/><path d="m24 72 11-8v16Z"/><path d="m120 72-11-8v16Z"/></g>`);
}
function pill(label,color,shoulder=false){
 return svg(120,52,`<defs>${gradient('shine',color)}</defs><rect x="3" y="6" width="114" height="43" rx="${shoulder?14:21}" fill="#11151c" fill-opacity=".4"/><rect x="5" y="3" width="110" height="41" rx="${shoulder?13:20}" fill="${color}" stroke="#11151c" stroke-opacity=".4"/><rect x="5" y="3" width="110" height="41" rx="${shoulder?13:20}" fill="url(#shine)"/><path d="M20 7h80" stroke="#fff" stroke-opacity=".3" stroke-linecap="round"/>${text(60,shoulder?32:29,label,shoulder?26:14,'#fff','font-weight="600" letter-spacing="1"')}`);
}
const cache=new Map();
export function controllerAssets(system,palette){
 const key=system+':'+palette;if(cache.has(key))return cache.get(key);
 const profile=skinProfile(system),t=skinTheme(system,palette),images={dpad:dpad(profile)};
 for(const [key,color]of Object.entries(profile.buttons))images[key]=roundButton(color,key.toUpperCase(),profile.faces==='diamond'&&['x','y'].includes(key));
 images.select=pill(system==='md'?'MODE':'SELECT',profile.design==='classic'?'#7a3441':'#4c515b');images.start=pill('START',profile.design==='classic'?'#7a3441':'#4c515b');
 if(profile.shoulders){images.l=pill('L',t.edge,true);images.r=pill('R',t.edge,true);}
 cache.set(key,images);return images;
}
function caseDetails(profile,t,rep){
 const {width:w,height:h}=rep.mappingSize,pad=rep.items[0].frame,px=pad.x+pad.width/2,py=pad.y+pad.height/2;
 const buttons=rep.items.filter(i=>Array.isArray(i.inputs)&&profile.buttons[i.inputs[0]]),x=Math.min(...buttons.map(b=>b.frame.x)),y=Math.min(...buttons.map(b=>b.frame.y)),right=Math.max(...buttons.map(b=>b.frame.x+b.frame.width)),bottom=Math.max(...buttons.map(b=>b.frame.y+b.frame.height));
 const cx=(x+right)/2,cy=(y+bottom)/2,rx=(right-x)/2+10,ry=(bottom-y)/2+10;
 const well=`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${t.dark}" fill-opacity=".14" stroke="#fff" stroke-opacity=".2"/>`;
 if(profile.design==='pocket')return `${well}<path d="M${w-18} ${h-18}h-48m6-6h42m-36-6h36m-30-6h30" stroke="${t.dark}" stroke-opacity=".35" stroke-width="2"/>`;
 if(profile.design==='clear')return `<g fill="none" stroke="${t.accent}" stroke-opacity=".16" stroke-width="2"><path d="M14 ${h*.52}h${w*.17}v${h*.4}h${w*.15}M${w-14} ${h*.54}h-${w*.16}v${h*.4}h-${w*.17}"/><rect x="${px-pad.width*.45}" y="${py-pad.height*.45}" width="${pad.width*.9}" height="${pad.height*.9}" rx="12"/><circle cx="${cx}" cy="${cy}" r="${rx}"/></g>${well}`;
 if(profile.design==='advance')return `<ellipse cx="${px}" cy="${py}" rx="${pad.width*.56}" ry="${pad.height*.61}" fill="${t.dark}" fill-opacity=".12" stroke="#fff" stroke-opacity=".22"/>${well}`;
 if(profile.design==='classic')return `<path d="M7 18h${w-14}M7 ${h-8}h${w-14}" stroke="${t.accent}" stroke-width="7"/><rect x="${x-7}" y="${y-8}" width="${right-x+14}" height="${bottom-y+16}" rx="8" fill="${t.dark}" fill-opacity=".22"/><path d="M${pad.x} ${pad.y-8}h${pad.width}" stroke="${t.accent}" stroke-width="3"/>`;
 if(profile.design==='four')return `${well}<circle cx="${px}" cy="${py}" r="${pad.width*.55}" fill="${t.dark}" fill-opacity=".1" stroke="#fff" stroke-opacity=".3"/>`;
 return `${well}<circle cx="${px}" cy="${py}" r="${pad.width*.54}" fill="none" stroke="${t.accent}" stroke-opacity=".45" stroke-width="2"/><path d="M10 ${h-12}h${w-20}" stroke="${t.accent}" stroke-opacity=".35"/>`;
}
export function controllerBody(system,palette,rep){
 const p=skinProfile(system),t=skinTheme(system,palette),{width:w,height:h}=rep.mappingSize,f=rep.screens[0].outputFrame;
 const radius=p.design==='classic'?12:p.design==='advance'?34:24;
 const screenRadius=['pocket','clear'].includes(p.design)?14:8;
 return svg(w,h,`<defs><linearGradient id="case" x2=".4" y2="1"><stop stop-color="${t.light}"/><stop offset=".18" stop-color="${t.face}"/><stop offset=".78" stop-color="${t.face}"/><stop offset="1" stop-color="${t.edge}"/></linearGradient><pattern id="grain" width="6" height="7" patternUnits="userSpaceOnUse"><circle cx="1" cy="2" r=".45" fill="#fff" fill-opacity=".06"/></pattern></defs><rect width="${w}" height="${h}" rx="${radius}" fill="${t.dark}"/><rect x="2" y="2" width="${w-4}" height="${h-5}" rx="${radius-2}" fill="url(#case)" stroke="#fff" stroke-opacity=".3"/><rect x="4" y="4" width="${w-8}" height="${h-9}" rx="${radius-4}" fill="url(#grain)"/>${caseDetails(p,t,rep)}<rect x="${f.x-5}" y="${f.y-5}" width="${f.width+10}" height="${f.height+10}" rx="${screenRadius}" fill="${p.design==='pocket'?'#555e59':p.design==='classic'?'#582b32':'#242632'}" stroke="#fff" stroke-opacity=".3"/><rect x="${f.x-1}" y="${f.y-1}" width="${f.width+2}" height="${f.height+2}" fill="#080b10"/>${!rep.wide?text(w/2,Math.max(21,f.y-17),p.mark,9,t.ink,'letter-spacing="2" font-weight="700"'):''}${text(w/2,h-6,'PalmoEMU',7,t.ink,'letter-spacing="2" opacity=".7"')}`);
}

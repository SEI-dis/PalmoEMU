// SPDX-License-Identifier: AGPL-3.0-or-later
// Original NDS layout and vector artwork. No images from commercial skins.
import {tr} from '../i18n/index.js';
import {applyControlLayout,screenBounds} from './control-layout.js';

const frame=(x,y,width,height)=>({x,y,width,height});
const svg=(w,h,body)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`);
const cross='M49 5h38q5 0 5 5v34h34q5 0 5 5v38q0 5-5 5H92v34q0 5-5 5H49q-5 0-5-5V92H10q-5 0-5-5V49q0-5 5-5h34V10q0-5 5-5Z';
const surface='<defs><linearGradient id="face" x2=".3" y2="1"><stop stop-color="#515658"/><stop offset=".5" stop-color="#303436"/><stop offset="1" stop-color="#202325"/></linearGradient></defs>';
function artwork(input,overlay){
 const fill=overlay?'#17191b':'url(#face)',opacity=overlay?'.34':'1',stroke=overlay?'#eee':'#7c8183';
 if(input==='dpad')return svg(136,136,`${surface}<path d="${cross}" fill="${fill}" fill-opacity="${opacity}" stroke="#000" stroke-width="7" stroke-opacity=".55"/><path d="${cross}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="1.8"/><path d="M68 19v18m0 62v18M19 68h18m62 0h18" fill="none" stroke="#eee" stroke-width="3.5" stroke-linecap="round"/>`);
 const pill=['l','r','select','start'].includes(input),w=pill?92:80,h=pill?42:80;
 return svg(w,h,`${surface}<rect x="3" y="4" width="${w-6}" height="${h-7}" rx="${pill?16:36}" fill="${fill}" fill-opacity="${opacity}" stroke="#000" stroke-width="5" stroke-opacity=".45"/><rect x="3" y="2" width="${w-6}" height="${h-7}" rx="${pill?16:36}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="1.5"/><text x="${w/2}" y="${h/2+(!pill?12:5)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${!pill?36:input.length>1?13:24}" fill="#f3f3f3">${input.toUpperCase()}</text>`);
}
const assets=Object.fromEntries([false,true].flatMap(overlay=>['dpad','a','b','x','y','l','r','select','start'].map(key=>[`nds-${overlay?'overlay':'solid'}-${key}`,artwork(key,overlay)])));

export function ndsLayout(width,height,layout,{displayOnly=false}={}){
 const wide=width>height,items=[],actions=[],screens=[];
 const screen=(id,label,f)=>screens.push({id,label,outputFrame:f});
 const item=(input,x,y,w,h=w)=>items.push({inputs:input==='dpad'?{up:'up',down:'down',left:'left',right:'right'}:[input],frame:frame(x,y,w,h),asset:{normal:`nds-${wide?'overlay':'solid'}-${input}`}});
 const action=(id,label,x,y,w,h=w)=>actions.push({id,label,frame:frame(x,y,w,h)});
 const faces=(x,y,size)=>{const b=size/3;item('x',x+b,y,b);item('y',x,y+b,b);item('a',x+2*b,y+b,b);item('b',x+b,y+2*b,b);};
 if(displayOnly){
  const sw=Math.min(wide?(width-4)/2:width,(wide?height:(height-4)/2)*4/3),sh=sw*3/4;
  const x=(width-(wide?sw*2+4:sw))/2,y=(height-(wide?sh:sh*2+4))/2;
  screen('screen-main',tr('メイン画面'),frame(x,y,sw,sh));screen('screen-sub',tr('サブ画面'),frame(x+(wide?sw+4:0),y+(wide?0:sh+4),sw,sh));
 }else if(wide){
  const rail=Math.min(42,width*.055),gap=3,mainW=Math.min(height*4/3,(width-rail-gap)*.67),mainH=mainW*3/4;
  const right=rail+mainW+gap,rw=width-right,subH=Math.min(rw*3/4,height*.56),subW=subH*4/3;
  screen('screen-main',tr('メイン画面'),frame(rail,(height-mainH)/2,mainW,mainH));
  screen('screen-sub',tr('サブ画面'),frame(right+(rw-subW)/2,0,subW,subH));
  const area=height-subH,s=Math.min(1.2,area/185,rw/250),size=138*s,cy=subH+32*s;
  faces(right+(rw-size)/2,cy,size);
  item('r',right+8*s,subH+4*s,58*s,26*s);
  item('select',right+rw-119*s,subH+5*s,52*s,24*s);item('start',right+rw-61*s,subH+5*s,52*s,24*s);
  const pad=Math.min(180,mainW*.32,height*.44),px=rail+14,py=height-pad-16;
  item('dpad',px,py,pad);item('l',px,py-37*s,68*s,29*s);
  action('player-menu','…',4,8,rail-8);action('quick-load','load',3,height-34,rail-6,28);
  action('boost','1×',right+8*s,height-32*s,40*s,26*s);action('quick-save','save',width-55*s,height-32*s,47*s,26*s);
 }else{
  const ch=Math.min(236,width*.59,height*.28),s=Math.min(1.1,width/390,ch/230),top=Math.min(26,height*.04),area=height-top-ch;
  const sw=Math.min(width-12,area/1.5),sh=sw*.75,y=top+(area-sh*2)/2,base=height-ch;
  screen('screen-main',tr('メイン画面'),frame((width-sw)/2,y,sw,sh));screen('screen-sub',tr('サブ画面'),frame((width-sw)/2,y+sh,sw,sh));
  action('quick-save','save',width*.3-27*s,base+2*s,54*s,28*s);action('quick-load','load',width*.7-27*s,base+2*s,54*s,28*s);
  item('l',12*s,base+39*s,74*s,34*s);item('r',width-86*s,base+39*s,74*s,34*s);
  item('select',width/2-52*s,base+41*s,48*s,26*s);item('start',width/2+4*s,base+41*s,48*s,26*s);
  item('dpad',14*s,base+83*s,140*s);faces(width-154*s,base+81*s,138*s);
  action('boost','1×',width/2-18*s,base+112*s,36*s);action('player-menu','…',width/2-18*s,height-42*s,36*s);
 }
 const rep={mappingSize:{width,height},wide,side:wide?screens[0].outputFrame.x:0,items,actions,screens,assets:{resizable:'responsive'}};
 // Older saved layouts moved the pair as one screen. Retain that transform,
 // then allow the new main/sub controls to adjust either screen independently.
 if(layout?.screen){
  const before=screenBounds(rep),group={outputFrame:{...before}};
  applyControlLayout({mappingSize:rep.mappingSize,items:[],screens:[group]},layout);
  const after=group.outputFrame,scale=after.width/before.width;
  for(const {outputFrame:f}of screens){f.x=after.x+(f.x-before.x)*scale;f.y=after.y+(f.y-before.y)*scale;f.width*=scale;f.height*=scale;}
 }
 return applyControlLayout(rep,layout);
}

export function ndsDisplayLayout(width,height,layout){
 const custom=layout?.screen||layout?.['screen-main']||layout?.['screen-sub'];
 const rep=ndsLayout(width,height,layout,{displayOnly:!custom});
 return {...rep,items:[],actions:[],assets:{}};
}

export function ndsSkinLayout(skin,width,height,layout){
 const rep=ndsLayout(width,height,layout);if(skin.system==='3ds'){const f=rep.screens[0].outputFrame;const h=f.width*.6;f.y+=(f.height-h)/2;f.height=h;}const accent={purple:'#b1a3cf',graphite:'#95a2ab',mint:'#98c7b1',sunset:'#cfaa96'}[skin.palette]||'#95a2ab';
 Object.assign(skin.images,assets);
 skin.images.responsive=svg(width,height,`<defs><linearGradient id="case" x2=".6" y2="1"><stop stop-color="#252729"/><stop offset=".5" stop-color="#111213"/><stop offset="1" stop-color="#292b2d"/></linearGradient><pattern id="grain" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8 8 0" stroke="#fff" stroke-opacity=".025"/></pattern></defs><rect width="${width}" height="${height}" rx="20" fill="url(#case)"/><rect x="2" y="2" width="${width-4}" height="${height-4}" rx="19" fill="url(#grain)" stroke="${accent}" stroke-opacity=".25"/>${rep.screens.map(({outputFrame:f})=>`<rect x="${f.x-2}" y="${f.y-2}" width="${f.width+4}" height="${f.height+4}" fill="#070809" stroke="#626568" stroke-opacity=".5"/>`).join('')}`);
 return rep;
}

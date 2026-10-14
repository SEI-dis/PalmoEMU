// SPDX-License-Identifier: MPL-2.0
// Also offered under AGPL-3.0-or-later for this combination; see ../MPL_SECONDARY_LICENSE.md.
// Adapted from pm-start/mgba-celio-web screen-effects.js, 23235bc6 (liru55 and contributors).
// Modified 2026-10-13: offscreen output, fixed 3x/4x bounds, lifecycle cleanup,
// local shader loading and pixel fallback. See shaders/COPYING.txt for xBRZ.
// Modified 2026-10-13: expose the upstream LCD/CRT amount (0..1, default .5).
export function createGPUFilter(onReady){
 let gl,surface,texture,uniforms,lastImage,failed=false,disposed=false,baseProgram,basePosition,xbrzPrograms,xbrzPending=false,analysisTexture,framebuffer;
 const shaders=[],programs=[],buffers=[];
  function initialize() {
    surface = document.createElement('canvas');
    surface.addEventListener('webglcontextlost', event => { event.preventDefault(); failed=true; onReady(); });
    gl = surface.getContext('webgl', {alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
    if (!gl) throw new Error('GPU filter failed');
    function shader(type, text) {
      const s = gl.createShader(type);shaders.push(s); gl.shaderSource(s,text); gl.compileShader(s);
      if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error('GPU filter failed'); return s;
    }
    const program = gl.createProgram();programs.push(program);
    gl.attachShader(program,shader(gl.VERTEX_SHADER, 'attribute vec2 position; varying vec2 uv; void main(){uv=vec2((position.x+1.0)*0.5,(1.0-position.y)*0.5);gl_Position=vec4(position,0.0,1.0);}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER, `precision mediump float;
      varying vec2 uv; uniform sampler2D picture; uniform vec2 resolution; uniform float mode; uniform float amount;
      void main(){
        vec2 p=uv;
        if(mode>2.5){vec2 q=uv*2.0-1.0;p=(q*(1.0+amount*0.035*dot(q,q))+1.0)*0.5;}
        if(p.x<0.0||p.y<0.0||p.x>1.0||p.y>1.0){gl_FragColor=vec4(0.025,0.035,0.055,1.0);return;}
        vec3 color=texture2D(picture,p).rgb;
        float line=0.5+0.5*cos(p.y*resolution.y*6.283185);
        if(mode<1.5){color*=1.0-amount*0.5*line;}
        else if(mode<2.5){
          vec2 cell=fract(p*resolution);float grid=step(0.86,cell.x)+step(0.86,cell.y);
          color=mix(color,color*vec3(0.88,1.0,0.90),amount*0.45);color*=1.0-amount*0.22*min(1.0,grid);
        }else{
          color*=1.0-amount*0.35*line;
          vec2 q=p*2.0-1.0;color*=1.0-amount*0.22*dot(q,q);
          float stripe=mod(floor(gl_FragCoord.x),3.0);vec3 mask=vec3(0.78);
          if(stripe<1.0)mask.r=1.0;else if(stripe<2.0)mask.g=1.0;else mask.b=1.0;
          color*=mix(vec3(1.0),mask,amount);
        }
        gl_FragColor=vec4(color,1.0);
      }`));
    gl.linkProgram(program); if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('GPU filter failed');
    gl.useProgram(program); const buffer=gl.createBuffer();buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const location=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
    baseProgram=program;basePosition=location;
    uniforms=Object.fromEntries(['picture','resolution','mode','amount'].map(name=>[name,gl.getUniformLocation(program,name)]));
    texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.uniform1i(uniforms.picture,0);
  }
  function xbrzProgram(fragment) {
    const program = gl.createProgram();programs.push(program);
    for (const [type,text] of [[gl.VERTEX_SHADER,'attribute vec2 position; varying vec4 TEX0; uniform float flip; void main(){vec2 uv=(position+1.0)*0.5;uv.y=mix(uv.y,1.0-uv.y,flip);TEX0=vec4(uv*1.0001,0.0,1.0);gl_Position=vec4(position,0.0,1.0);}'],[gl.FRAGMENT_SHADER,'#define FRAGMENT 1\n'+fragment]]) {
      const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,text);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error('GPU filter failed');gl.attachShader(program,shader);
    }
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('GPU filter failed');
    return {program,position:gl.getAttribLocation(program,'position'),uniforms:Object.fromEntries(['flip','Texture','TextureSize','InputSize','OutputSize','PassPrev2Texture','PassPrev2TextureSize'].map(name=>[name,gl.getUniformLocation(program,name)]))};
  }
  async function loadXbrz() {
    if(xbrzPending||xbrzPrograms)return;
    xbrzPending=true;
    try {
      const files=await Promise.all(['shaders/xbrz-pass0.glsl','shaders/xbrz-pass1.glsl'].map(async url=>{const response=await fetch(new URL('../../'+url,import.meta.url));if(!response.ok)throw new Error('GPU filter failed');return response.text();}));
      if(disposed)return;xbrzPrograms=files.map(xbrzProgram);analysisTexture=gl.createTexture();framebuffer=gl.createFramebuffer();
      onReady();
    }catch(error){failed=true;onReady();}
    finally{xbrzPending=false;}
  }
  function drawXbrz(vw,vh,w,h) {
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,analysisTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    if(analysisTexture.width!==lastImage.width||analysisTexture.height!==lastImage.height){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,lastImage.width,lastImage.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);analysisTexture.width=lastImage.width;analysisTexture.height=lastImage.height;}
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,analysisTexture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('GPU filter failed');
    function bind(pass,flip,outputW,outputH) {
      gl.useProgram(pass.program);gl.enableVertexAttribArray(pass.position);gl.vertexAttribPointer(pass.position,2,gl.FLOAT,false,0,0);
      gl.uniform1f(pass.uniforms.flip,flip);gl.uniform2f(pass.uniforms.TextureSize,lastImage.width,lastImage.height);gl.uniform2f(pass.uniforms.InputSize,lastImage.width,lastImage.height);gl.uniform2f(pass.uniforms.OutputSize,outputW,outputH);
    }
    bind(xbrzPrograms[0],0,lastImage.width,lastImage.height);gl.uniform1i(xbrzPrograms[0].uniforms.Texture,0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.viewport(0,0,lastImage.width,lastImage.height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(Math.round((w-vw)/2),Math.round((h-vh)/2),Math.round(vw),Math.round(vh));
    bind(xbrzPrograms[1],1,vw,vh);gl.uniform1i(xbrzPrograms[1].uniforms.Texture,0);gl.bindTexture(gl.TEXTURE_2D,analysisTexture);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(xbrzPrograms[1].uniforms.PassPrev2Texture,1);gl.uniform2f(xbrzPrograms[1].uniforms.PassPrev2TextureSize,lastImage.width,lastImage.height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.activeTexture(gl.TEXTURE0);
  }

 function render(image,effect,strength=.5){
  if(failed||disposed)return null;
  try{
   if(!gl)initialize();lastImage=image;
   if(effect==='xbrz'&&!xbrzPrograms){void loadXbrz();return null;}
   const n=effect==='xbrz'?4:3,w=image.width*n,h=image.height*n;
   if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h;}
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,image.width,image.height,0,gl.RGBA,gl.UNSIGNED_BYTE,image.data);
   if(effect==='xbrz')drawXbrz(w,h,w,h);else{
    gl.useProgram(baseProgram);gl.enableVertexAttribArray(basePosition);gl.vertexAttribPointer(basePosition,2,gl.FLOAT,false,0,0);
    const amount=typeof strength==='number'&&Number.isFinite(strength)?Math.max(0,Math.min(1,strength)):.5;
    gl.uniform1i(uniforms.picture,0);gl.uniform2f(uniforms.resolution,image.width,image.height);gl.uniform1f(uniforms.mode,effect==='lcd'?2:3);gl.uniform1f(uniforms.amount,amount);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
   }
   return surface;
  }catch{failed=true;return null;}
 }
 return {render,get failed(){return failed;},get surface(){return surface;},dispose(){disposed=true;if(!gl)return;for(const p of programs)gl.deleteProgram(p);for(const s of shaders)gl.deleteShader(s);for(const b of buffers)gl.deleteBuffer(b);gl.deleteTexture(texture);if(analysisTexture)gl.deleteTexture(analysisTexture);if(framebuffer)gl.deleteFramebuffer(framebuffer);gl.getExtension('WEBGL_lose_context')?.loseContext();}};
}

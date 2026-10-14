// SPDX-License-Identifier: AGPL-3.0-or-later
// Deterministic PCM measurements; no recordings or ROMs.
const assert=require('node:assert/strict');
const frequency=(data,rate)=>{
 const crossings=[];for(let i=Math.floor(rate*.04)+1;i<data.length;i++)if(data[i-1]<0&&data[i]>=0)crossings.push(i-data[i]/(data[i]-data[i-1]));
 return (crossings.length-1)*rate/(crossings.at(-1)-crossings[0]);
};
const rms=data=>Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length);
module.exports={frequency,rms};
if(require.main===module)(async()=>{
 const {TimeStretch}=await import('../src/rendering/time-stretch.js');let cases=0,maxMs=0;
 function run(rate,speed,seconds,left,right,chunkSizes=[541,17,2048,733,1]){
  const n=Math.round(rate*seconds),pcm=new Int16Array(n*2),stretch=new TimeStretch(rate,speed),output=[[],[]];
  for(let i=0;i<n;i++){pcm[i*2]=left(i/rate)*32767;pcm[i*2+1]=right(i/rate)*32767;}
  let frame=0,chunk=0,max=0;const start=performance.now();
  while(frame<n){const count=Math.min(n-frame,chunkSizes[chunk++%chunkSizes.length]);stretch.push(pcm,frame*2,count,(l,r)=>{output[0].push(l.slice());output[1].push(r.slice());});frame+=count;max=Math.max(max,stretch.size);}
  const elapsed=performance.now()-start;maxMs=Math.max(maxMs,elapsed);assert.ok(max<stretch.capacity,'Bounded FIFO');
  const join=chunks=>{const result=new Float32Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}return result;};
  const data=output.map(join);assert.ok(Math.abs(data[0].length/rate-seconds/speed)<.03,'Output duration follows game speed');assert.ok(data.every(c=>c.every(v=>Number.isFinite(v)&&Math.abs(v)<=1)));
  return {data,stretch,pcm,elapsed};
 }
 for(const rate of [32768,44100,48000])for(const speed of [2,3,4,5]){
  const {data}=run(rate,speed,2,t=>.6*Math.sin(2*Math.PI*440*t),t=>.3*Math.sin(2*Math.PI*660*t));
  for(const [channel,hz,amplitude]of [[0,440,.6],[1,660,.3]]){
   const actual=frequency(data[channel],rate);assert.ok(Math.abs(actual-hz)<4,`${rate} / ${speed}x / channel ${channel}: ${actual} Hz`);
   assert.ok(rms(data[channel])>amplitude*.58,`Stereo energy ${rate} / ${speed}x / ${channel}`);
  }cases++;
 }
 for(const hz of [55,220,997,2200])for(const speed of [2,5]){
  const tone=t=>.5*Math.sin(2*Math.PI*hz*t),{data}=run(48000,speed,3,tone,t=>-tone(t));
  assert.ok(Math.abs(frequency(data[0],48000)-hz)<Math.max(1,hz*.01),'Low/high/antiphase pitch: '+hz);
  assert.ok(data[0].every((v,i)=>Math.abs(v+data[1][i])<1e-6),'Stereo phase alignment');assert.ok(rms(data[0])>.29);cases++;
 }
 const tone=t=>.5*Math.sin(2*Math.PI*440*t),a=run(44100,3,1,tone,tone),b=run(44100,3,1,tone,tone,[8192]);
 assert.deepEqual(a.data,b.data,'PCM chunk boundaries cannot change the result');
 a.stretch.reset();assert.equal(a.stretch.size,0);assert.equal(a.stretch.started,false);
 const silent=[];a.stretch.push(new Int16Array(44100*2),0,44100,(l,r)=>silent.push(...l,...r));assert.ok(silent.every(v=>v===0),'Reset drops all prior sound, including overlap tail');
 console.log(`PASS: ${cases} pitch/tempo/stereo cases, 32.768/44.1/48 kHz, bass/high tones, antiphase, irregular chunks, bounded buffers and reset. Max PCM case: ${maxMs.toFixed(1)} ms.`);
})().catch(e=>{console.error(e);process.exitCode=1;});

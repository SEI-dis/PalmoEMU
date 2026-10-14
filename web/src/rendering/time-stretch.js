// SPDX-License-Identifier: AGPL-3.0-or-later
// Original streaming WSOLA implementation. Algorithm reference:
// https://www.isca-archive.org/eurospeech_1993/roelands93_eurospeech.html
// Stereo channels share one alignment; the analysis clock never follows the
// chosen match, so a periodic waveform cannot accumulate a tempo drift.
export class TimeStretch {
 constructor(rate,speed){
  if(!Number.isFinite(rate)||rate<8000||rate>192000||!Number.isFinite(speed)||speed<=1||speed>5)throw new RangeError('Unsupported time-stretch rate');
  this.rate=rate;this.speed=speed;
  this.hop=Math.round(rate*.02);this.seek=Math.round(rate*.012);
  this.stride=Math.max(1,Math.round(rate/8000));this.coarse=Math.max(1,Math.round(rate/6000));
  this.capacity=Math.ceil(rate*.25);
  this.input=new Float32Array(this.capacity*2);this.tail=new Float32Array(this.hop*2);
  this.left=new Float32Array(this.hop);this.right=new Float32Array(this.hop);
  this.fade=Float32Array.from({length:this.hop},(_,i)=>.5-.5*Math.cos(Math.PI*i/(this.hop-1)));
  this.reset();
 }
 reset(){this.size=0;this.base=0;this.next=0;this.started=false;}
 push(pcm,offset,frames,emit){
  // Work on native-rate PCM. No growing FIFO or per-sample allocation.
  while(frames>0){
   const count=Math.min(frames,this.capacity-this.size),end=offset+count*2;
   for(let src=offset,dst=this.size*2;src<end;src++,dst++)this.input[dst]=pcm[src]/32768;
   this.size+=count;frames-=count;offset=end;this.produce(emit);
  }
 }
 match(center){
  const low=Math.max(0,center-this.seek),high=Math.min(this.size-2*this.hop,center+this.seek),stride=this.stride*2;
  let energy=0;for(let i=0;i<this.tail.length;i+=stride)energy+=this.tail[i]**2+this.tail[i+1]**2;
  if(energy<1e-9)return Math.max(low,Math.min(high,center));
  const score=at=>{
   let dot=0,power=0;
   for(let i=0,j=at*2;i<this.tail.length;i+=stride,j+=stride){
    const l=this.input[j],r=this.input[j+1];dot+=l*this.tail[i]+r*this.tail[i+1];power+=l*l+r*r;
   }
   return dot/Math.sqrt(energy*power+1e-20)-.015*Math.abs(at-center)/this.seek;
  };
  let best=Math.max(low,Math.min(high,center)),value=score(best);
  for(let at=low;at<=high;at+=this.coarse){const s=score(at);if(s>value){value=s;best=at;}}
  const start=Math.max(low,best-this.coarse),end=Math.min(high,best+this.coarse);
  for(let at=start;at<=end;at++){const s=score(at);if(s>value){value=s;best=at;}}
  return best;
 }
 produce(emit){
  const hop=this.hop,input=this.input;
  // Prime two output hops together, avoiding an initial gap while searching
  // for the next segment. Live playback latency remains bounded in milliseconds.
  if(!this.started&&this.size>=Math.ceil(this.speed*hop)+this.seek+2*hop){
   for(let i=0;i<hop;i++){this.left[i]=input[i*2];this.right[i]=input[i*2+1];}
   this.tail.set(input.subarray(hop*2,hop*4));this.started=true;this.next=this.speed*hop;
   emit(this.left,this.right);
  }
  if(!this.started)return;
  while(Math.round(this.next)+this.seek+2*hop<=this.base+this.size){
   const at=this.match(Math.round(this.next)-this.base);
   for(let i=0;i<hop;i++){
    const weight=this.fade[i],j=(at+i)*2;
    this.left[i]=this.tail[i*2]*(1-weight)+input[j]*weight;
    this.right[i]=this.tail[i*2+1]*(1-weight)+input[j+1]*weight;
   }
   this.tail.set(input.subarray((at+hop)*2,(at+2*hop)*2));this.next+=this.speed*hop;
   // Scratch arrays are reused; consumers must copy before returning.
   emit(this.left,this.right);
  }
  const drop=Math.max(0,Math.min(this.size,Math.floor(this.next)-this.seek-this.base));
  if(drop){input.copyWithin(0,drop*2,this.size*2);this.base+=drop;this.size-=drop;}
 }
}

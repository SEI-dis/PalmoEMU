// SPDX-License-Identifier: AGPL-3.0-or-later
// Opt-in, bounded aggregate measurements. No ROM identifiers or pixel/audio data.
export function createPerformanceDiagnostics({clock=()=>performance.now()}={}){
 let enabled=false,active=false,core=null,canvas=null,expected=1000/60,last=null,started=0,elapsed=0;
 let intervals=[],draws=[],saves=[],frames=0,gaps=0,audioGaps=0,audioGapMs=0,audioQueueMaxMs=0,audioOverflowDrops=0,audioOverflowSamples=0,audioOverflowResets=0,saveCount=0,saveFailures=0;
 const finite=value=>Number.isFinite(value)&&value>=0;
 const sample=(list,value)=>{if(!finite(value))return;list.push(Math.min(value,3600000));if(list.length>256)list.shift();};
 const round=value=>Math.round(value*10)/10;
 const stats=list=>{const sorted=[...list].sort((a,b)=>a-b);return {samples:sorted.length,p95Ms:sorted.length?round(sorted[Math.ceil(sorted.length*.95)-1]):0,maxMs:sorted.length?round(sorted.at(-1)):0};};
 const acceptsAudio=engine=>enabled&&active&&core&&!core.paused&&!core.closed&&(engine===core||engine===core.cores?.[core.view]);
 function reset(){intervals=[];draws=[];saves=[];frames=0;gaps=0;audioGaps=0;audioGapMs=0;audioQueueMaxMs=0;audioOverflowDrops=0;audioOverflowSamples=0;audioOverflowResets=0;saveCount=0;saveFailures=0;last=null;elapsed=0;started=active?clock():0;}
 function pause(){if(active)elapsed+=Math.max(0,clock()-started);active=false;last=null;}
 return {
  get measuring(){return enabled&&active;},
  configure({enable=false,running=false,engine=null,fps=60}={}){
   const changed=engine&&engine!==core;if(changed||!!enable!==enabled){pause();reset();}
   core=enable?engine:null;
   enabled=!!enable;canvas=engine?.videos?.[0]?.canvas||engine?.canvas||null;
   const interval=1000/(Number.isFinite(fps)&&fps>0?Math.min(240,fps):60);if(interval!==expected)last=null;expected=interval;
   const next=enabled&&!!running&&!!engine;if(next&&!active){started=clock();last=null;}else if(!next)pause();active=next;
  },
  frame(target,start,end){if(!enabled||!active||target!==canvas)return;const now=finite(end)?end:clock();sample(draws,now-start);frames++;if(last!==null){const interval=now-last;sample(intervals,interval);if(interval>expected*1.75)gaps++;}last=now;},
  audioGap(seconds,engine){if(!acceptsAudio(engine)||!finite(seconds)||seconds<.003)return;audioGaps++;audioGapMs+=Math.min(seconds,60)*1000;},
  audioQueue(seconds,engine){if(!acceptsAudio(engine)||!finite(seconds))return;audioQueueMaxMs=Math.max(audioQueueMaxMs,Math.min(seconds,60)*1000);},
  // Samples are native sample frames (one value per channel), not PCM data.
  audioOverflow(samples,resetStretch,engine){if(!acceptsAudio(engine)||!Number.isSafeInteger(samples)||samples<=0)return;audioOverflowDrops++;audioOverflowSamples=Math.min(Number.MAX_SAFE_INTEGER,audioOverflowSamples+samples);if(resetStretch===true)audioOverflowResets++;},
  save(milliseconds,success=true,engine=null){if(!enabled||!core||engine!==core)return;sample(saves,milliseconds);saveCount++;if(!success)saveFailures++;},
  reset,
  snapshot(){return {enabled,measuring:enabled&&active,durationMs:round(elapsed+(active?Math.max(0,clock()-started):0)),frames,delayedFrames:gaps,frameInterval:stats(intervals),drawing:stats(draws),audio:{gaps:audioGaps,gapMs:round(audioGapMs),queueMaxMs:round(audioQueueMaxMs),overflowDrops:audioOverflowDrops,overflowSamples:audioOverflowSamples,overflowResets:audioOverflowResets},saving:{count:saveCount,failures:saveFailures,...stats(saves)}};}
 };
}
export const performanceDiagnostics=createPerformanceDiagnostics();

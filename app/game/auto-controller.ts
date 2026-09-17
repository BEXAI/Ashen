/** Provisional controller proposal, not device calibration or GPU timing. */
export type AutoFrameClass='steady'|'loading'|'warmup'|'paused'|'hit-pause';
export type AutoFrame={nowMs:number;pacedIntervalMs:number;cpuSubmissionMs:number;classification:AutoFrameClass};
export type AutoProfile={stage:number;scale:number;fps:30|60;bloom:boolean;shadowSize:256|512;secondaryDetail:'full'|'reduced'};
export type AutoWindow={samples:number;eligibleMs:number;targetFps:30|60;intervalP95:number;cpuP95:number;missedFraction:number;pressure:'cpu-submission'|'interval-only'|'none'};
export type AutoDecision={before:AutoProfile;after:AutoProfile;reason:string;window:AutoWindow};

const SCALES=[1,1,1,.9,.8,.7,.65] as const;
const WINDOW_MS=3000, MIN_SAMPLES=30, CHANGE_WARMUP_MS=2000;
const DOWN_COOLDOWN_MS=8000, UP_COOLDOWN_MS=30000;
const BAD_WINDOWS=2, GOOD_WINDOWS=5;
const profile=(stage:number,fps:30|60):AutoProfile=>({stage,scale:SCALES[stage],fps,bloom:stage===0,shadowSize:stage<2?512:256,secondaryDetail:stage===0?'full':'reduced'});
const p95=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*.95)];

/** Auto-only output decisions. This class neither schedules frames nor touches assets. */
export class AutoController {
 private stage=0;private fps:30|60=60;
 private intervals:number[]=[];private cpu:number[]=[];private elapsed=0;
 private bad=0;private good=0;private goodFor60=0;
 private lastNow:number|null=null;private acceptAfter=0;private nextDown=0;private nextUp=0;
 private probing=false;private probeWindows=0;private probeGood=0;private failedProbes=0;private nextProbe=0;
 private lastWindow:AutoWindow|null=null;private limit:string|null=null;
 get current(){return profile(this.stage,this.fps);}
 get status(){return {profile:this.current,probing60:this.probing,nextProbeMs:this.nextProbe,failedProbes:this.failedProbes,limitation:this.limit,lastWindow:this.lastWindow};}
 /** Pause/resume, tab/context lifecycle, orientation, and manual scenario boundaries.
  * Keep the chosen quality; reset evidence. Use a new controller for a new Auto session. */
 resetSamples(nowMs:number,warmupMs=2000){
  this.clearEvidence();this.lastNow=nowMs;this.acceptAfter=nowMs+Math.max(0,warmupMs);
  this.probeWindows=0;this.probeGood=0;this.limit=null;
 }
 private clearWindow(){this.intervals=[];this.cpu=[];this.elapsed=0;}
 private clearEvidence(){this.clearWindow();this.bad=0;this.good=0;this.goodFor60=0;this.probeWindows=0;this.probeGood=0;}
 private change(now:number,stage:number,fps:30|60,reason:string,window:AutoWindow):AutoDecision{
  const before=this.current;this.stage=stage;this.fps=fps;this.limit=null;this.clearEvidence();
  this.acceptAfter=now+CHANGE_WARMUP_MS;this.nextDown=now+DOWN_COOLDOWN_MS;this.nextUp=now+UP_COOLDOWN_MS;
  return {before,after:this.current,reason,window};
 }
 sample(frame:AutoFrame):AutoDecision|null{
  const {nowMs:now,pacedIntervalMs:interval,cpuSubmissionMs:cpu,classification}=frame;
  if(!Number.isFinite(now)||!Number.isFinite(interval)||!Number.isFinite(cpu)||interval<=0||cpu<0)return null;
  if(this.lastNow!==null&&(now<this.lastNow||now-this.lastNow>1000)){
   this.resetSamples(now);return null; // Diagnostics should retain this excluded gap separately.
  }
  this.lastNow=now;
  if(classification!=='steady'){
   // Frequent short, intentional hit pauses must not prevent combat adaptation.
   // They add neither time nor samples; actual loading/pause breaks the evidence run.
   if(classification!=='hit-pause')this.clearEvidence();
   return null;
  }
  if(now<this.acceptAfter)return null;
  this.elapsed+=Math.min(interval,250);
  this.intervals.push(interval);this.cpu.push(cpu);
  if(this.intervals.length>600){this.intervals.shift();this.cpu.shift();}
  if(this.elapsed<WINDOW_MS||this.intervals.length<MIN_SAMPLES)return null;
  const budget=1000/this.fps,intervalP95=p95(this.intervals),cpuP95=p95(this.cpu);
  const missedFraction=this.intervals.filter(ms=>ms>budget*1.2).length/this.intervals.length;
  const cpuPressure=cpuP95>budget*.9,bad=missedFraction>.15||cpuPressure;
  const healthy=intervalP95<=budget*1.08&&cpuP95<=budget*.65;
  const window:AutoWindow={samples:this.intervals.length,eligibleMs:this.elapsed,targetFps:this.fps,intervalP95,cpuP95,missedFraction,pressure:cpuPressure?'cpu-submission':bad?'interval-only':'none'};
  this.lastWindow=window;this.clearWindow();
  if(this.probing){
   this.probeWindows++;if(healthy)this.probeGood++;
   if(bad||this.probeWindows>=2&&this.probeGood<2){
    this.probing=false;this.failedProbes++;this.nextProbe=now+Math.min(600000,120000*2**(this.failedProbes-1));
    return this.change(now,this.stage,30,'60 FPS probe missed its budget; restore 30 FPS and back off',window);
   }
   if(this.probeWindows>=2){
    this.probing=false;this.failedProbes=0;this.nextUp=now+UP_COOLDOWN_MS;this.clearEvidence();
    return {before:this.current,after:this.current,reason:'60 FPS probe sustained two healthy windows',window};
   }
   return null;
  }
  this.bad=bad?this.bad+1:0;this.good=healthy?this.good+1:0;
  this.goodFor60=this.fps===30&&healthy&&cpuP95<=(1000/60)*.65?this.goodFor60+1:0;
  if(this.bad>=BAD_WINDOWS&&now>=this.nextDown){
   if(this.stage<SCALES.length-1)return this.change(now,this.stage+1,this.fps,'Sustained target-budget pressure',window);
   if(this.fps===60){this.nextProbe=now+60000;return this.change(now,this.stage,30,'Optional work, shadow detail and resolution reduced; use 30 FPS',window);}
   this.limit='Sustained overload remains at Auto minimum and 30 FPS; physical-device profiling required';
   return null;
  }
  if(!bad)this.limit=null;
  if(this.fps===30){
   // A 33ms paced interval cannot demonstrate 60fps headroom. A bounded live probe
   // is needed even when CPU submission is cheap, because GPU time is unavailable.
   if(this.goodFor60>=GOOD_WINDOWS&&now>=this.nextProbe){
    this.probing=true;this.probeWindows=0;this.probeGood=0;
    return this.change(now,this.stage,60,'Probe 60 FPS with current reduced visual settings',window);
   }
   return null;
  }
  if(this.good>=GOOD_WINDOWS&&now>=this.nextUp&&this.stage>0)return this.change(now,this.stage-1,60,'Sustained 60 FPS headroom; restore one visual stage',window);
  return null;
 }
}

export type FrameClass = 'steady' | 'loading' | 'warmup' | 'paused' | 'hit-pause';
export type FrameSample = { atMs:number; intervalMs:number; rafIntervalMs:number; cpuSubmissionMs:number; classification:FrameClass };

export function timingSummary(values:number[]) {
  const sorted=[...values].sort((a,b)=>a-b),at=(p:number)=>sorted[Math.floor(Math.max(0,sorted.length-1)*p)]??null;
  return {samples:sorted.length,p50:at(.5),p95:at(.95),p99:at(.99),stallsOver100Ms:values.filter(v=>v>100).length};
}

/** A bounded local record. Loading stalls remain visible outside the steady-state percentiles. */
export class FrameMeasurements {
  readonly renderState=new RenderStateHistory();
  private samples:FrameSample[]=[];
  private started=0;
  private warmupUntil=0;
  private sequence=0;
  private reason='construction';
  private previous:Record<string,unknown>[]=[];
  reset(reason:string,now=performance.now(),warmupMs=2000) {
    if(this.samples.length||this.renderState.hasData){this.previous.push(this.report(true));if(this.previous.length>3)this.previous.shift();}
    this.samples=[];this.started=now;this.warmupUntil=now+warmupMs;this.reason=reason;this.sequence++;
    this.renderState.reset(now,warmupMs);
  }
  add(at:number,interval:number,rafInterval:number,cpu:number,classification:FrameClass) {
    if(!Number.isFinite(interval)||interval<=0||!Number.isFinite(cpu)||cpu<0)return;
    const phase=classification==='steady'&&at<this.warmupUntil?'warmup':classification;
    this.samples.push({atMs:at-this.started,intervalMs:interval,rafIntervalMs:rafInterval,cpuSubmissionMs:cpu,classification:phase});
    if(this.samples.length>6000)this.samples.shift();
  }
  report(raw=false) {
    const steady=this.samples.filter(s=>s.classification==='steady');
    const summary={sequence:this.sequence,reason:this.reason,samplesRetained:this.samples.length,steadyObservationDurationMs:steady.reduce((sum,s)=>sum+s.intervalMs,0),
      framePacerIntervalMs:timingSummary(steady.map(s=>s.intervalMs)),
      rafIntervalBeforeRenderedFramesMs:timingSummary(steady.map(s=>s.rafIntervalMs).filter(n=>n>0)),
      cpuSubmissionMs:timingSummary(steady.map(s=>s.cpuSubmissionMs)),
      gpuTimeMs:null,gpuTimingStatus:'unavailable: no GPU timer query collected',
      classes:Object.fromEntries(['steady','loading','warmup','paused','hit-pause'].map(c=>[c,timingSummary(this.samples.filter(s=>s.classification===c).map(s=>s.intervalMs))])),
      method:'rAF interval is the callback immediately preceding each rendered frame (skipped callbacks are not retained); paced interval is between rendered frames; performance.now around simulation and CPU render submission. CPU submission is not GPU execution.',
      renderState:this.renderState.report(raw),
      ...(raw?{rawSamples:this.samples.map(s=>({...s}))}:{})};
    return summary;
  }
  export(){return {current:this.report(true),previous:structuredClone(this.previous)};}
}
import {RenderStateHistory} from './render-state-history';

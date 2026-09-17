import type {FrameClass} from './frame-measurements';

export type RenderCounters={mainDraws:number;mainTriangles:number;totalDraws:number;totalTriangles:number;rendererGeometries:number;rendererTextures:number;rendererPrograms:number|null;drawingBufferWidth:number;drawingBufferHeight:number;drawingBufferPixels:number};
export type SceneResourceEstimate={sceneGeometries:number;sceneTextureObjects:number;sceneTextureSources:number;estimatedTextureStorageGroups:number;estimatedSceneBufferBytes:number;estimatedAssetTextureBytes:number;unknownTextureStorageGroups:number};
export type RenderSnapshotState={quality:string;rendererSize:[number,number];exposure:number;resources:SceneResourceEstimate;context:Record<string,unknown>};
export type RenderStateSample={atMs:number;classification:FrameClass;trigger:'first'|'periodic'|'state-change';changes:string[];counters:RenderCounters;state:RenderSnapshotState};
type Peak={value:number;atMs:number};

/** Actual rendered-frame observations only; no timer or interpolated samples. */
export class RenderStateHistory {
 private samples:RenderStateSample[]=[];private started=0;private warmupUntil=0;private lastCapture:number|null=null;private lastObserved:number|null=null;private lastKey:string|null=null;
 private pending=new Set<string>();private observedFrames=0;private captured=0;private peaks:Partial<Record<keyof RenderCounters,Peak>>={};
 private estimatePeaks:Partial<Record<keyof SceneResourceEstimate,Peak>>={};
 private latestCounters:RenderCounters|null=null;
 readonly capacity=600;
 reset(now:number,warmupMs:number){this.samples=[];this.started=now;this.warmupUntil=now+Math.max(0,warmupMs);this.lastCapture=null;this.lastObserved=null;this.lastKey=null;this.pending.clear();this.observedFrames=0;this.captured=0;this.peaks={};this.estimatePeaks={};this.latestCounters=null;}
 get hasData(){return this.observedFrames>0;}
 markChanged(reason:string){if(this.pending.size<8)this.pending.add(reason.slice(0,80));}
 capture(at:number,classification:FrameClass,counters:RenderCounters,readState:()=>RenderSnapshotState,stateKey=''){
  if(!Number.isFinite(at)||at<this.started||this.lastObserved!==null&&at<this.lastObserved)return false;
  this.lastObserved=at;this.observedFrames++;this.latestCounters={...counters};const relative=at-this.started;
  for(const name of Object.keys(counters) as (keyof RenderCounters)[]){const value=counters[name];if(value!==null&&Number.isFinite(value)&&(!this.peaks[name]||value>this.peaks[name]!.value))this.peaks[name]={value,atMs:relative};}
  if(this.lastKey!==null&&stateKey!==this.lastKey)this.markChanged('render resources or configuration');this.lastKey=stateKey;
  const first=this.lastCapture===null,elapsed=first?Infinity:at-this.lastCapture!;
  if(!first&&elapsed<1000&&(!this.pending.size||elapsed<250))return false;
  // The caller supplies a lazy snapshot so scene inspection and context copying
  // occur only for real retained samples, inside the measured CPU interval.
  const state=structuredClone(readState());
  const sample:RenderStateSample={atMs:relative,classification:classification==='steady'&&at<this.warmupUntil?'warmup':classification,trigger:first?'first':elapsed>=1000?'periodic':'state-change',changes:[...this.pending],counters:{...counters},state};
  for(const name of Object.keys(state.resources) as (keyof SceneResourceEstimate)[]){const value=state.resources[name];if(Number.isFinite(value)&&(!this.estimatePeaks[name]||value>this.estimatePeaks[name]!.value))this.estimatePeaks[name]={value,atMs:relative};}
  this.pending.clear();this.lastCapture=at;this.samples.push(sample);this.captured++;if(this.samples.length>this.capacity)this.samples.shift();return true;
 }
 report(raw=false){return {capacity:this.capacity,observedRenderedFrames:this.observedFrames,samplesRetained:this.samples.length,samplesCaptured:this.captured,samplesEvicted:this.captured-this.samples.length,firstRetainedAtMs:this.samples[0]?.atMs??null,lastRetainedAtMs:this.samples.at(-1)?.atMs??null,
  counterHighWater:structuredClone(this.peaks),sampledEstimateHighWater:structuredClone(this.estimatePeaks),lastObservedCounters:this.latestCounters?{...this.latestCounters}:null,
  sampling:'At most one periodic snapshot per second of rendered work; real state-change snapshots throttled to 250ms. No catch-up samples during suspend/pause. Counter high-water values observe every rendered frame; scene estimates observe retained snapshots only.',
  interpretation:'rendererGeometries/textures/programs are renderer-tracked resource counts, not GPU memory bytes. Texture objects and Sources are counted separately; texture byte estimates deduplicate matching Source identity plus the installed Three WebGLTextures upload/sampling cache key. Scene buffer/asset texture bytes are estimates of scene-referenced data, exclude detached caches, driver/transient allocations and render-target attachments. Character LOD counts describe groups marked visible, not independent GPU visibility queries. Main/total draw and triangle counts are the existing render counters. GPU timing is unavailable; no physical-device claim is inferred.',
  ...(raw?{samples:structuredClone(this.samples)}:{})};}
}

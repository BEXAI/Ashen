import * as T from 'three';

import { FrameMeasurements, type FrameClass } from './frame-measurements';
import type {RenderCounters,SceneResourceEstimate} from './render-state-history';

export function visibleCharacterLodCounts(actors:readonly {group:{visible:boolean;userData:Record<string,unknown>};visual?:unknown}[]){
 const bySkin=new Map<string,Record<string,number>>();let visibleGroups=0;
 for(const actor of actors){if(!actor.group.visible)continue;visibleGroups++;const skin=typeof actor.group.userData.skin==='string'?actor.group.userData.skin.slice(0,64):'unknown',value=actor.group.userData.activeLod,lod=!actor.visual?'procedural':value===0||value===1||value===2?String(value):'unselected';const counts=bySkin.get(skin)??{0:0,1:0,2:0,procedural:0,unselected:0};counts[lod]++;bySkin.set(skin,counts);}
 return {visibleGroups,bySkin:Object.fromEntries(bySkin)};
}

// Matches installed Three src/renderers/webgl/WebGLTextures.js getTextureCacheKey.
// Offset/repeat/channel affect texture coordinates; they do not split upload storage.
function textureStorageKey(t:T.Texture){return [t.wrapS,t.wrapT,(t as T.Texture&{wrapR?:number}).wrapR||0,t.magFilter,t.minFilter,t.anisotropy,t.internalFormat,t.format,t.type,t.generateMipmaps,t.premultiplyAlpha,t.flipY,t.unpackAlignment,t.colorSpace].join();}

/** Scene-referenced storage estimates, never a claim of total GPU residency. */
export function estimateSceneResources(scene:T.Scene):SceneResourceEstimate{
 const textures=new Set<T.Texture>(),geometries=new Set<T.BufferGeometry>();
 const ranges=new Map<ArrayBufferLike,[number,number][]>();
 const view=(array:ArrayBufferView)=>{const list=ranges.get(array.buffer)??[];list.push([array.byteOffset,array.byteOffset+array.byteLength]);ranges.set(array.buffer,list);};
 const texture=(value:unknown)=>{if(value instanceof T.Texture&&!value.isRenderTargetTexture)textures.add(value);};
 texture(scene.environment);texture(scene.background);
 scene.traverse(o=>{const mesh=o as T.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);
  if(o instanceof T.InstancedMesh){view(o.instanceMatrix.array);if(o.instanceColor)view(o.instanceColor.array);}
  if(o instanceof T.SkinnedMesh)texture(o.skeleton.boneTexture);
  for(const m of mesh.material?Array.isArray(mesh.material)?mesh.material:[mesh.material]:[]){for(const v of Object.values(m))texture(v);if(m instanceof T.ShaderMaterial)for(const uniform of Object.values(m.uniforms))texture(uniform.value);}
 });
 for(const g of geometries){for(const a of Object.values(g.attributes))view('data'in a?a.data.array:a.array);if(g.index)view(g.index.array);for(const list of Object.values(g.morphAttributes))for(const a of list??[])view('data'in a?a.data.array:a.array);}
 let estimatedSceneBufferBytes=0;
 for(const list of ranges.values()){list.sort((a,b)=>a[0]-b[0]);let lo=-1,hi=-1;for(const [start,end]of list){if(start>hi){if(lo>=0)estimatedSceneBufferBytes+=hi-lo;lo=start;hi=end;}else hi=Math.max(hi,end);}if(lo>=0)estimatedSceneBufferBytes+=hi-lo;}
 const sources=new Map<T.Texture['source'],Map<string,T.Texture[]>>();
 for(const t of textures){const keys=sources.get(t.source)??new Map<string,T.Texture[]>(),key=textureStorageKey(t),list=keys.get(key)??[];list.push(t);keys.set(key,list);sources.set(t.source,keys);}
 let estimatedAssetTextureBytes=0,unknownTextureStorageGroups=0,estimatedTextureStorageGroups=0;
 for(const keys of sources.values())for(const list of keys.values()){
  estimatedTextureStorageGroups++;let estimate:number|null=null;
  for(const t of list){
   if(t instanceof T.CompressedTexture){estimate=Math.max(estimate??0,t.mipmaps.reduce((n,m)=>n+m.data.byteLength,0));continue;}
   const image=t.image as {width?:number;height?:number;data?:ArrayBufferView}|undefined;if(!image?.width||!image.height)continue;
   const components=t.format===T.RedFormat?1:t.format===T.RGFormat?2:4,componentBytes=t.type===T.FloatType?4:t.type===T.HalfFloatType?2:1;
   estimate=Math.max(estimate??0,(image.data?.byteLength??image.width*image.height*components*componentBytes)*(t.generateMipmaps?4/3:1));
  }
  if(estimate===null)unknownTextureStorageGroups++;else estimatedAssetTextureBytes+=estimate;
 }
 return {sceneGeometries:geometries.size,sceneTextureObjects:textures.size,sceneTextureSources:sources.size,estimatedTextureStorageGroups,estimatedSceneBufferBytes,estimatedAssetTextureBytes,unknownTextureStorageGroups};
}
export const BENCHMARK_VIEWS = {
  sconce: { player:[5,49], camera:[6.7,3.6,47.1], target:[9.1,3.25,49] },
  sconce_cinder: { player:[11,20], camera:[12.7,3.6,18.1], target:[15.1,3.25,20] },
  sconce_dusk: { player:[14,-10], camera:[15.7,3.6,-11.9], target:[18.1,3.25,-10] },
  sconce_crown: { player:[11,-38], camera:[12.7,3.6,-39.9], target:[15.1,3.25,-38] },
  sconce_throne: { player:[14,-69], camera:[15.7,3.6,-70.9], target:[18.1,3.25,-69] },
  shrine_cinder: { player:[9,14], camera:[14.8,3.8,16.8], target:[11,1,12] },
  shrine_dusk: { player:[-11,-14], camera:[-9.2,3.8,-11.2], target:[-13,1,-16] },
  shrine_crown: { player:[9,-40], camera:[14.8,3.8,-37.2], target:[11,1,-42] },
  arch_entry: { player:[0,43], camera:[5,5.2,47], target:[0,4,38] },
  arch_cinder: { player:[0,13], camera:[5,5.2,17], target:[0,4,8] },
  arch_dusk: { player:[0,-17], camera:[5,5.2,-13], target:[0,4,-22] },
  arch_crown: { player:[0,-43], camera:[5,5.2,-39], target:[0,4,-48] },
  entrance: { player: [0, 51], camera: [5, 4.8, 57], target: [0, 1.65, 48] },
  character: { player: [0, 49], camera: [2.9, 2.25, 45], target: [0, 1.45, 49] },
  combat: { player: [0, 22], camera: [5, 4.5, 28], target: [0, 1.7, 20] },
  water: { player: [3, -7], camera: [12, 4.2, -2], target: [5, 1.1, -10] },
  chapel: { player:[0,-38], camera:[7,5.2,-31], target:[0,1.8,-42] },
  passage_entry: { player:[0,35], camera:[2,4,39], target:[0,1.5,30] },
  passage_cinder: { player:[0,7], camera:[2,4,12], target:[0,1.5,1] },
  passage_dusk: { player:[0,-23], camera:[2,4,-18], target:[0,1.5,-29] },
  passage_crown: { player:[0,-50], camera:[2,4,-45], target:[0,1.5,-58] },
  boss: { player: [0, -66], camera: [7, 5.5, -59], target: [0, 2.5, -73] },
} as const;
export type BenchmarkView = keyof typeof BENCHMARK_VIEWS;

/** Draw counters are actual submissions; allocation figures are explicitly estimates. */
export class FrameDiagnostics {
  readonly measurements=new FrameMeasurements();
  private mainDraws = 0;
  private mainTriangles = 0;
  private hooked = new WeakSet<T.Object3D>();
  private frame = { mainDraws: 0, mainTriangles: 0, totalDraws: 0, totalTriangles: 0 };
  private sampleSize=new T.Vector2();
  markRenderStateChanged(reason:string){this.measurements.renderState.markChanged(reason);}
  /** Call after render, before sampling cpuSubmissionMs; expensive work is lazy. */
  captureRenderState(renderer:T.WebGLRenderer,scene:T.Scene,quality:string,at:number,classification:FrameClass,readContext:()=>Record<string,unknown>){
    const counters:RenderCounters={mainDraws:this.mainDraws,mainTriangles:Math.round(this.mainTriangles),totalDraws:renderer.info.render.calls,totalTriangles:renderer.info.render.triangles,rendererGeometries:renderer.info.memory.geometries,rendererTextures:renderer.info.memory.textures,rendererPrograms:renderer.info.programs?.length??null,drawingBufferWidth:renderer.domElement.width,drawingBufferHeight:renderer.domElement.height,drawingBufferPixels:renderer.domElement.width*renderer.domElement.height};
    const key=`${quality}:${counters.drawingBufferWidth}:${counters.drawingBufferHeight}:${counters.rendererGeometries}:${counters.rendererTextures}:${counters.rendererPrograms}`;
    return this.measurements.renderState.capture(at,classification,counters,()=>({quality,rendererSize:renderer.getSize(this.sampleSize).toArray() as [number,number],exposure:renderer.toneMappingExposure,resources:estimateSceneResources(scene),context:readContext()}),key);
  }
  hook(scene: T.Scene, camera: T.Camera) {
    scene.traverse(object => {
      if (!(object instanceof T.Mesh || object instanceof T.Points || object instanceof T.Line) || this.hooked.has(object)) return;
      this.hooked.add(object);
      const previous = object.onBeforeRender;
      object.onBeforeRender = (renderer, world, view, geometry, material, group) => {
        previous.call(object, renderer, world, view, geometry, material, group);
        if (view !== camera || world.overrideMaterial) return;
        this.mainDraws++;
        const drawGroup=group as unknown as {start?:number;count?:number}|null;
        const start = Math.max(geometry.drawRange.start, drawGroup?.start ?? 0);
        const end = Math.min(geometry.drawRange.start + geometry.drawRange.count,
          (drawGroup?.start ?? 0) + (drawGroup?.count ?? Infinity), geometry.index?.count ?? geometry.attributes.position.count);
        if(object instanceof T.Mesh)this.mainTriangles += Math.max(0, end - start) / 3 * (object instanceof T.InstancedMesh ? object.count : 1);
      };
    });
  }
  begin(renderer: T.WebGLRenderer) { this.mainDraws = 0; this.mainTriangles = 0; renderer.info.autoReset = false; renderer.info.reset(); }
  end(renderer: T.WebGLRenderer, elapsed: number, rafInterval:number, cpuSubmission:number, classification:FrameClass,at=performance.now()) {
    this.measurements.add(at,elapsed,rafInterval,cpuSubmission,classification);
    this.frame = { mainDraws: this.mainDraws, mainTriangles: Math.round(this.mainTriangles), totalDraws: renderer.info.render.calls, totalTriangles: renderer.info.render.triangles };
  }
  report(renderer: T.WebGLRenderer, scene: T.Scene, quality: string, context:Record<string,unknown>={}) {
    const resources=estimateSceneResources(scene);
    return { ...context, quality, exposure: renderer.toneMappingExposure,
      output: renderer.getSize(new T.Vector2()).toArray(), ...this.frame,
      timing:this.measurements.report(),
      textures: resources.sceneTextureObjects, geometryBytes:resources.estimatedSceneBufferBytes, estimatedAssetTextureMiB: +(resources.estimatedAssetTextureBytes/1048576).toFixed(2),resourceEstimate:resources,
      gpuResources: {...renderer.info.memory}, caveat: 'Asset texture estimates exclude render targets (listed separately), decoded images and driver allocations; these are not total GPU memory. Desktop or resized browser results are not physical phone measurements.' };
  }
}

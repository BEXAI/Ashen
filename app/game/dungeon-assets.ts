import { applyWorldSurfaceUV } from './surface-uv';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { WorldScene } from './world';
import type { Surface } from './graphics';

export const DUNGEON_MANIFEST_URL='/assets/dungeon/v13/manifest.json';

type Entry={id:string;z:number;depth:number;url:string;lightmap:string};
type Loaded={root:T.Group;lightmap:T.Texture;fallback:T.Object3D[];surfaces:Surface[]};
export class DungeonAssets{
 private stopped=false;private abort=new AbortController();private queue:Promise<void>=Promise.resolve();private loaded=new Map<string,Loaded>();private pending=new Set<string>();private z=51;
 private manifest:Promise<{version:string;rooms:Entry[]}>;
 manifestVersion:string|null=null;
 get status(){return {version:this.manifestVersion,loaded:[...this.loaded.keys()],pending:[...this.pending]};}
 constructor(private world:WorldScene,private invalidate:()=>void){this.manifest=fetch(DUNGEON_MANIFEST_URL,{signal:this.abort.signal}).then(r=>{if(!r.ok)throw Error('Dungeon manifest unavailable');return r.json();});void this.manifest.catch(()=>{});}
 update(z:number){
  if(this.stopped)return;this.z=z;
  for(const chunk of this.world.chunks){
   const distance=Math.abs(chunk.z-z)-chunk.depth/2;
   if(distance<42&&!this.loaded.has(chunk.id)&&!this.pending.has(chunk.id)){
    this.pending.add(chunk.id);this.queue=this.queue.then(()=>this.load(chunk.id)).catch(()=>{}).finally(()=>this.pending.delete(chunk.id));
   }
   if(distance>58&&this.loaded.has(chunk.id))this.release(chunk.id);
  }
 }
 private async load(id:string){
  if(this.stopped)return;const manifest=await this.manifest;this.manifestVersion=manifest.version;const entry=manifest.rooms.find(r=>r.id===id);if(!entry||Math.abs(entry.z-this.z)-entry.depth/2>50)return;
  const response=await fetch(entry.url,{signal:this.abort.signal});if(!response.ok)throw Error('Room unavailable');
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(await response.arrayBuffer(),entry.url.slice(0,entry.url.lastIndexOf('/')+1));
  let texture:T.Texture|undefined;const surfaces:Surface[]=[];
  try{
   texture=await new T.TextureLoader().loadAsync(entry.lightmap);texture.colorSpace=T.NoColorSpace;texture.flipY=false;texture.channel=1;texture.generateMipmaps=false;texture.minFilter=T.LinearFilter;
   if(this.stopped||Math.abs(entry.z-this.z)-entry.depth/2>50)throw Error('Stale room request');
   gltf.scene.updateMatrixWorld(true);
   gltf.scene.traverse(o=>{if(!(o instanceof T.Mesh))return;const source=o.material as T.MeshStandardMaterial,family=source.userData.surfaceFamily as Surface['family']|null;
    const base=family?this.world.surfaces.find(s=>s.family===family):undefined;const material=base?base.material.clone():source;
    if(base){applyWorldSurfaceUV(o.geometry,o.matrixWorld);source.dispose();const surface={material,family:base.family,repeat:base.repeat};surfaces.push(surface);this.world.surfaces.push(surface);}
    material.vertexColors=!!o.geometry.attributes.color;material.lightMap=texture!;material.lightMapIntensity=.8;material.envMapIntensity=.12;material.needsUpdate=true;o.material=material;o.castShadow=true;o.receiveShadow=true;
   });
   const chunk=this.world.chunks.find(c=>c.id===id)!;const fallback=chunk.group.children.filter(o=>!o.userData.runtimeFixture);fallback.forEach(o=>o.removeFromParent());
   chunk.group.add(gltf.scene);chunk.loaded=true;this.loaded.set(id,{root:gltf.scene,lightmap:texture,fallback,surfaces});this.invalidate();
  }catch(error){
   for(const surface of surfaces){const i=this.world.surfaces.indexOf(surface);if(i>=0)this.world.surfaces.splice(i,1);}
   texture?.dispose();gltf.scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(o.material as T.Material).dispose();}});throw error;
  }
 }
 private release(id:string){
  const entry=this.loaded.get(id);if(!entry)return;entry.root.removeFromParent();entry.root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(o.material as T.Material).dispose();}});entry.lightmap.dispose();
  for(const surface of entry.surfaces){const i=this.world.surfaces.indexOf(surface);if(i>=0)this.world.surfaces.splice(i,1);}
  const chunk=this.world.chunks.find(c=>c.id===id)!;chunk.group.add(...entry.fallback);chunk.loaded=false;this.loaded.delete(id);
 }
 dispose(){if(this.stopped)return;this.stopped=true;this.abort.abort();for(const id of [...this.loaded.keys()])this.release(id);}
}

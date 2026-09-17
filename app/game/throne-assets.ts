import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {disposeTree} from './character-assets';
import {BONE_THRONE} from './dungeon';

export const THRONE_MANIFEST_URL='/assets/props/v3/manifest.json';
type Asset={compressed_url:string;fallback_url:string;sha256:string;fallback_sha256:string;source_project_id:string;source_revision:number};
type Manifest={version:string;assets:{boneThrone:Asset}};
/** One vertex-colored relic, streamed separately from the baked central throne. */
export class ThroneAssets {
  private root:T.Group|null=null;private disposed=false;private generation=0;private enabled=true;private lastNeeded=false;
  private life=new AbortController();private request:AbortController|null=null;
  private manifest:Promise<Manifest>|null=null;
  private fallback:T.Mesh;
  private frustum=new T.Frustum();private viewProjection=new T.Matrix4();
  private bounds=new T.Sphere(new T.Vector3(BONE_THRONE.x,1.26,BONE_THRONE.z),1.58);
  private collision=new T.Box3(new T.Vector3(BONE_THRONE.x-BONE_THRONE.halfWidth,0,BONE_THRONE.z-BONE_THRONE.halfDepth),new T.Vector3(BONE_THRONE.x+BONE_THRONE.halfWidth,2.516,BONE_THRONE.z+BONE_THRONE.halfDepth));
  private hitPoint=new T.Vector3();
  readonly status={enabled:true,state:'unloaded',fallback:false,version:null as string|null,sourceProject:null as string|null,sourceRevision:null as number|null,instances:0,residentInstances:0,draws:0,triangles:0};
  constructor(private scene:T.Scene,private invalidate:()=>void){
    const boxes:T.BoxGeometry[]=[],box=(w:number,h:number,d:number,x:number,y:number,z:number)=>boxes.push(new T.BoxGeometry(w,h,d).translate(x,y,z));
    box(.88,.1,.96,0,.05,0);for(const x of [-.34,.34])for(const z of [-.32,.32])box(.06,.55,.06,x,.375,z);
    box(.75,.08,.72,0,.7,0);box(.72,.95,.06,0,1.19,-.34);for(const x of [-.34,.34])box(.06,.12,.72,x,.9,0);
    const geometry=mergeGeometries(boxes);boxes.forEach(g=>g.dispose());
    this.fallback=new T.Mesh(geometry,new T.MeshStandardMaterial({color:'#9e9884',roughness:.9}));this.fallback.name='Bone Throne loading fallback';this.fallback.position.set(BONE_THRONE.x,0,BONE_THRONE.z);this.fallback.scale.setScalar(BONE_THRONE.scale);this.fallback.visible=false;this.fallback.castShadow=true;this.fallback.receiveShadow=true;scene.add(this.fallback);
    void this.getManifest().catch(()=>{});
  }
  private getManifest():Promise<Manifest>{
    if(!this.manifest)this.manifest=fetch(THRONE_MANIFEST_URL,{signal:this.life.signal}).then(async r=>{if(!r.ok)throw Error('Throne manifest unavailable');return await r.json() as Manifest;}).catch(error=>{this.manifest=null;throw error;});
    return this.manifest;
  }
  setEnabled(value:boolean){this.enabled=value;this.status.enabled=value;if(!value)this.release();this.invalidate();}
  obstruction(ray:T.Ray,far:number){const hit=ray.intersectBox(this.collision,this.hitPoint);if(!hit)return Infinity;const distance=hit.distanceTo(ray.origin);return distance<=far?distance:Infinity;}
  update(camera:T.PerspectiveCamera,x:number,z:number){
    if(this.disposed||!this.enabled)return;
    const distance=Math.hypot(x-BONE_THRONE.x,z-BONE_THRONE.z),needed=distance<44;
    if(distance>60&&(this.root||this.status.state==='loading'))this.release();
    if(needed&&!this.lastNeeded&&this.status.state==='failed')this.status.state='unloaded';this.lastNeeded=needed;
    if(needed&&this.status.state==='unloaded')void this.load();
    camera.updateMatrixWorld(true);this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.viewProjection);
    const visible=distance<48&&this.frustum.intersectsSphere(this.bounds);if(this.root)this.root.visible=visible;
    this.fallback.visible=!this.root&&visible;this.status.fallback=this.fallback.visible;
    this.status.instances=visible?1:0;this.status.draws=this.status.instances;this.status.triangles=this.status.instances*(this.root?6120:108);
  }
  private async parse(url:string,hash:string,signal:AbortSignal){
    const response=await fetch(url,{signal});if(!response.ok)throw Error('Throne download unavailable');const bytes=await response.arrayBuffer();
    const digest=await crypto.subtle.digest('SHA-256',bytes);if([...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')!==hash)throw Error('Throne hash mismatch');
    return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,url.slice(0,url.lastIndexOf('/')+1));
  }
  private async load(){
    const generation=++this.generation,request=this.request=new AbortController();this.status.state='loading';let root:T.Group|null=null;
    try{
      const manifest=await this.getManifest(),asset=manifest.assets.boneThrone;let gltf,fallback=false;
      try{gltf=await this.parse(asset.compressed_url,asset.sha256,request.signal);}catch(error){if(request.signal.aborted)throw error;fallback=true;gltf=await this.parse(asset.fallback_url,asset.fallback_sha256,request.signal);}
      root=gltf.scene;if(this.disposed||generation!==this.generation){disposeTree(root,true);return;}
      let draws=0,triangles=0;root.traverse(o=>{if(o instanceof T.Mesh){draws+=Array.isArray(o.material)?o.material.length:1;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;if(!o.geometry.attributes.color)throw Error('Throne vertex colors missing');o.castShadow=true;o.receiveShadow=true;}});
      if(draws!==1||triangles!==6120)throw Error('Throne geometry exceeds its runtime budget');
      root.name='Higgsfield Bone Throne';root.position.set(BONE_THRONE.x,0,BONE_THRONE.z);root.scale.setScalar(BONE_THRONE.scale);root.visible=false;this.scene.add(root);this.root=root;
      Object.assign(this.status,{state:fallback?'ready: fallback':'ready: compressed',version:manifest.version,sourceProject:asset.source_project_id,sourceRevision:asset.source_revision,residentInstances:1});this.invalidate();
    }catch{if(root)disposeTree(root,true);if(!this.disposed&&generation===this.generation){this.release();this.status.state='failed';this.invalidate();}}
  }
  private release(){this.generation++;this.request?.abort();this.request=null;if(this.root){this.root.removeFromParent();disposeTree(this.root,true);}this.root=null;this.fallback.visible=false;Object.assign(this.status,{state:'unloaded',fallback:false,instances:0,residentInstances:0,draws:0,triangles:0});}
  dispose(){if(this.disposed)return;this.disposed=true;this.life.abort();this.release();this.fallback.removeFromParent();disposeTree(this.fallback,true);}
}

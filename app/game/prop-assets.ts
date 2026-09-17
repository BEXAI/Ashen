import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {disposeTree} from './character-assets';
import type {TorchFixture,WorldScene} from './world';

type Asset={compressed_url:string;fallback_url:string;sha256:string;fallback_sha256:string;source_project_id:string;source_revision:number};
type Mounted={fixture:TorchFixture;matrix:T.Matrix4;position:T.Vector3;lod:number;previousFlameFloor:unknown;hadFlameFloor:boolean};
export const PROP_MANIFEST_URL='/assets/props/v2/manifest.json';
export function selectPropLod(pixels:number,current:number){
  if(pixels>(current===0?75:95))return 0;
  if(pixels>(current===1?28:40))return 1;
  return 2;
}

/** Shared instanced decoration. Existing world code exclusively owns flames and lights. */
export class PropAssets {
  private reducedSecondary=false;private enabled=true;private disposed=false;private generation=0;private life=new AbortController();private request:AbortController|null=null;
  private manifest:Promise<{version:string;assets:{sconce:Asset}}>;
  private ktx:KTX2Loader;private template:T.Group|null=null;
  private batches:{mesh:T.InstancedMesh;local:T.Matrix4}[]=[];private mounted:Mounted[]=[];private corbels:T.InstancedMesh|null=null;
  private clock=1;private matrix=new T.Matrix4();private lastNeeded=false;
  private frustum=new T.Frustum();private viewProjection=new T.Matrix4();private bounds=new T.Sphere(new T.Vector3(),1.2);
  readonly status={enabled:true,state:'unloaded',version:null as string|null,sourceProject:null as string|null,sourceRevision:null as number|null,instances:0,residentInstances:0,draws:0,triangles:0,visibleLods:[0,0,0]};
  constructor(private world:WorldScene,renderer:T.WebGLRenderer,private invalidate:()=>void,private fixtureRooms?:readonly string[]){
    this.ktx=new KTX2Loader().setTranscoderPath('/assets/decoders/three-r180/').setWorkerLimit(1).detectSupport(renderer);
    this.manifest=fetch(PROP_MANIFEST_URL,{signal:this.life.signal}).then(r=>{if(!r.ok)throw Error('Prop manifest unavailable');return r.json();});void this.manifest.catch(()=>{});
  }
 setSecondaryDetail(value:boolean){this.reducedSecondary=value;this.clock=1;}
  setEnabled(value:boolean){this.enabled=value;this.status.enabled=value;if(!value)this.release();this.invalidate();}
  update(camera:T.PerspectiveCamera,z:number,outputHeight:number,dt:number){
    if(this.disposed||!this.enabled)return;
    // Share one decoded template across all chambers; optional room scope supports the reference slice.
    const fixtures=this.world.fixtures.filter(f=>!this.fixtureRooms||this.fixtureRooms.includes(f.roomId)),nearest=Math.min(...fixtures.map(f=>Math.abs(f.z-z)));
    const needed=nearest<42;
    if(!needed&&nearest>58&&(this.template||this.status.state==='loading'))this.release();
    if(needed&&!this.lastNeeded&&this.status.state==='failed')this.status.state='unloaded';
    this.lastNeeded=needed;
    if(needed&&this.status.state==='unloaded')void this.load(fixtures);
    if(!this.template)return;
    this.clock+=dt;if(this.clock<.12&&dt>0)return;this.clock=0;
    camera.updateMatrixWorld(true);this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.viewProjection);
    const counts=[0,0,0];let visible=0;
    for(const mount of this.mounted){
      this.bounds.center.copy(mount.position);
      if(Math.abs(mount.fixture.z-z)>44||!this.frustum.intersectsSphere(this.bounds))continue;
      const distance=mount.position.distanceTo(camera.position),pixels=outputHeight*1.1/(Math.max(1,distance)*2*Math.tan(T.MathUtils.degToRad(camera.fov/2)));
      mount.lod=selectPropLod(pixels*(this.reducedSecondary&&distance>14?.75:1),mount.lod);const batch=this.batches[mount.lod];
      this.matrix.multiplyMatrices(mount.matrix,batch.local);batch.mesh.setMatrixAt(counts[mount.lod]++,this.matrix);
      this.matrix.makeTranslation((mount.fixture.wallX+mount.position.x)/2,mount.position.y-.48,mount.fixture.z);this.corbels!.setMatrixAt(visible++,this.matrix);
    }
    for(let i=0;i<3;i++){const mesh=this.batches[i].mesh;mesh.count=counts[i];mesh.instanceMatrix.needsUpdate=true;mesh.visible=counts[i]>0;}
    this.corbels!.count=visible;this.corbels!.visible=visible>0;this.corbels!.instanceMatrix.needsUpdate=true;
    this.status.triangles=counts.reduce((sum,n,i)=>sum+n*(this.batches[i].mesh.geometry.index?.count??this.batches[i].mesh.geometry.attributes.position.count)/3,visible*12);
    this.status.visibleLods=counts;this.status.instances=visible;this.status.residentInstances=this.mounted.length;this.status.draws=counts.filter(n=>n>0).length+(visible>0?1:0);
  }
  private async parse(url:string,hash:string,signal:AbortSignal){
    const r=await fetch(url,{signal});if(!r.ok)throw Error('Prop download unavailable');const bytes=await r.arrayBuffer();
    if(crypto.subtle){const digest=await crypto.subtle.digest('SHA-256',bytes);if([...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')!==hash)throw Error('Prop hash mismatch');}
    return new GLTFLoader().setKTX2Loader(this.ktx).setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,url.slice(0,url.lastIndexOf('/')+1));
  }
  private async load(fixtures:TorchFixture[]){
    const generation=++this.generation,request=this.request=new AbortController();this.status.state='loading';let root:T.Group|null=null;
    try{
      const manifest=await this.manifest,asset=manifest.assets.sconce;this.status.version=manifest.version;
      let fallback=false,gltf;
      try{gltf=await this.parse(asset.compressed_url,asset.sha256,request.signal);}catch(error){if(request.signal.aborted)throw error;fallback=true;gltf=await this.parse(asset.fallback_url,asset.fallback_sha256,request.signal);}
      root=gltf.scene;if(this.disposed||generation!==this.generation){disposeTree(root,true);return;}
      root.updateMatrixWorld(true);const meshes:T.Mesh[]=[];root.traverse(o=>{if(o instanceof T.Mesh&&Number.isInteger(o.userData.lod))meshes[o.userData.lod]=o;});
      const flame=root.getObjectByName('FlameOrigin'),mount=root.getObjectByName('Mount'),light=root.getObjectByName('LightOrigin');
      if(meshes.length!==3||[0,1,2].some(i=>!meshes[i])||!flame||!mount||!light)throw Error('Incomplete prop contract');
      const anchor=flame.getWorldPosition(new T.Vector3());
      this.mounted=fixtures.map(fixture=>{const rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-fixture.side*Math.PI/2),position=fixture.flame.getWorldPosition(new T.Vector3()).sub(anchor.clone().applyQuaternion(rotation));return {fixture,position,matrix:new T.Matrix4().compose(position,rotation,new T.Vector3(1,1,1)),lod:-1,previousFlameFloor:fixture.flame.userData.flameFloor,hadFlameFloor:Object.hasOwn(fixture.flame.userData,'flameFloor')};});
      this.batches=meshes.map((mesh,lod)=>{const batch=new T.InstancedMesh(mesh.geometry,mesh.material,fixtures.length);batch.name=`Higgsfield sconce LOD${lod}`;batch.count=0;batch.castShadow=true;batch.receiveShadow=true;batch.frustumCulled=false;this.world.scene.add(batch);return {mesh:batch,local:mesh.matrixWorld.clone()};});
      const stone=this.world.surfaces.find(s=>s.family==='wall')!.material,geometry=new T.BoxGeometry(.735,1.02,.54);
      const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
      geometry.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(p.count*3).fill(1),3));
      for(let i=0;i<p.count;i++)uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/4,p.getY(i)/4);
      this.corbels=new T.InstancedMesh(geometry,stone,fixtures.length);this.corbels.name='Stone torch mounting corbels';this.corbels.castShadow=true;this.corbels.receiveShadow=true;this.corbels.frustumCulled=false;this.corbels.count=0;
      for(const m of this.mounted){m.fixture.fallback.visible=false;m.fixture.flame.userData.flameFloor=m.fixture.flame.getWorldPosition(new T.Vector3()).y-.02;}
      this.world.scene.add(this.corbels);this.template=root;this.status.state=fallback?'ready: PNG fallback':'ready: compressed';this.status.sourceProject=asset.source_project_id;this.status.sourceRevision=asset.source_revision;this.clock=1;this.invalidate();
    }catch{if(root)disposeTree(root,true);if(!this.disposed&&generation===this.generation){this.release();this.status.state='failed';this.invalidate();}}
  }
  private release(){
    this.generation++;this.request?.abort();this.request=null;
    for(const m of this.mounted){m.fixture.fallback.visible=true;if(m.hadFlameFloor)m.fixture.flame.userData.flameFloor=m.previousFlameFloor;else delete m.fixture.flame.userData.flameFloor;}this.mounted=[];
    for(const b of this.batches){b.mesh.removeFromParent();b.mesh.dispose();}this.batches=[];
    if(this.corbels){this.corbels.removeFromParent();this.corbels.geometry.dispose();this.corbels.dispose();this.corbels=null;}
    if(this.template)disposeTree(this.template,true);this.template=null;this.status.state='unloaded';this.status.instances=0;this.status.residentInstances=0;this.status.draws=0;this.status.triangles=0;this.status.visibleLods=[0,0,0];
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.life.abort();this.release();this.ktx.dispose();}
}

import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {disposeTree} from './character-assets';
import {architecturePlacements,type ArchitectureModule,type ArchitecturePlacement} from './architecture-placements';

export const ARCHITECTURE_MANIFEST_URL='/assets/props/v2/manifest.json';
export type ArchitectureBudget={draws:number;triangles:number};
type Asset={compressed_url:string;fallback_url:string;sha256:string;fallback_sha256:string;source_project_id:string;source_revision:number};
type Manifest={version:string;assets:{architecture:Asset}};
type Batch={mesh:T.InstancedMesh;local:T.Matrix4;triangles:number};
type Mount={placement:ArchitecturePlacement;matrix:T.Matrix4;bounds:T.Box3;center:T.Vector3};
type Candidate={module:ArchitectureModule;mounts:Mount[];lod:number};
const MODULES:ArchitectureModule[]=['Arch','Pillar','Trim'];
const TARGETS={Arch:[6000,3000,1200],Pillar:[1200,600,240],Trim:[600,300,120]};
const HEIGHT={Arch:8.88,Pillar:5.2,Trim:.35};
const DEFAULT_BUDGET:ArchitectureBudget={draws:3,triangles:12000};
export function selectArchitectureLod(pixels:number,current:number){
 if(pixels>(current===0?260:320))return 0;
 if(pixels>(current===1?64:80))return 1;
 return 2;
}

/** One active instanced batch per module. Original room/gate collision remains separate. */
export class ArchitectureAssets {
 private enabled=true;private disposed=false;private generation=0;private request:AbortController|null=null;
 private manifest:Manifest|null=null;private template:T.Group|null=null;private batches=new Map<ArchitectureModule,Batch[]>();private mounts:Mount[]=[];
 private previousVisibility=new Map<T.Object3D,boolean>();private lods={Arch:-1,Pillar:-1,Trim:-1};private reducedSecondary=false;
 private placements:ArchitecturePlacement[];
 private retryAt=0;private retryCount=0;private clock=1;private budgetKey='';
 private matrix=new T.Matrix4();private frustum=new T.Frustum();private viewProjection=new T.Matrix4();
 readonly status={enabled:true,state:'unloaded',version:null as string|null,sourceProject:null as string|null,sourceRevision:null as number|null,residentInstances:0,instances:0,draws:0,triangles:0,lods:{Arch:-1,Pillar:-1,Trim:-1},budgetLimited:false};
 constructor(private world:{scene:T.Scene},renderer:T.WebGLRenderer,private invalidate:()=>void,private options:{placements?:ArchitecturePlacement[];fallbacks?:ReadonlyMap<string,readonly T.Object3D[]>;now?:()=>number}={}){
  this.placements=(options.placements??architecturePlacements()).map(p=>({...p,position:[p.position[0],p.position[1],p.position[2]]}));
  this.ktx=new KTX2Loader().setTranscoderPath('/assets/decoders/three-r180/').setWorkerLimit(1).detectSupport(renderer);
 }
 private ktx:KTX2Loader;
 private now(){return this.options.now?.()??performance.now();}
 setEnabled(value:boolean){this.enabled=value;this.status.enabled=value;if(!value)this.release();else{this.retryAt=0;if(this.status.state==='failed')this.status.state='unloaded';}this.invalidate();}
 setSecondaryDetail(value:boolean){if(value===this.reducedSecondary)return;this.reducedSecondary=value;this.clock=1;this.invalidate();}
 update(camera:T.PerspectiveCamera,z:number,outputHeight:number,dt:number,remaining:ArchitectureBudget=DEFAULT_BUDGET){
  if(this.disposed||!this.enabled)return;
  const placements=this.placements,nearest=Math.min(...placements.map(p=>Math.abs(p.position[2]-z)));
  if(nearest>60&&(this.template||this.status.state==='loading'))this.release();
  if(nearest<44&&!this.template&&this.status.state!=='loading'&&this.now()>=this.retryAt)void this.load(placements);
  if(!this.template)return;
  const budget={draws:Math.min(3,Math.max(0,Math.floor(remaining.draws))),triangles:Math.min(25000,Math.max(0,Math.floor(remaining.triangles)))};
  const key=`${budget.draws}:${budget.triangles}`;this.clock+=Math.max(0,dt);
  if(dt>0&&this.clock<.12&&key===this.budgetKey)return;this.clock=0;this.budgetKey=key;
  camera.updateMatrixWorld(true);this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.viewProjection);
  const candidates:Candidate[]=[];const visible=new Set<string>();
  for(const moduleName of MODULES){
   const mounts=this.mounts.filter(m=>m.placement.module===moduleName&&Math.abs(m.placement.position[2]-z)<=46&&this.frustum.intersectsBox(m.bounds));
   if(!mounts.length)continue;mounts.forEach(m=>visible.add(m.placement.id));
   const pixels=Math.max(...mounts.map(m=>outputHeight*HEIGHT[moduleName]/(Math.max(1,m.center.distanceTo(camera.position))*2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))));
   this.lods[moduleName]=selectArchitectureLod(pixels*(this.reducedSecondary?.75:1),this.lods[moduleName]);
   candidates.push({module:moduleName,mounts,lod:this.lods[moduleName]});
  }
  // Keep all instances of a module in one LOD batch; split LODs would add draws.
  // Budget pressure first coarsens geometry, then omits the least important module.
  const accepted=candidates.slice(0,budget.draws);const cost=()=>accepted.reduce((n,c)=>n+c.mounts.length*this.batches.get(c.module)![c.lod].triangles,0);
  let limited=accepted.length<candidates.length;
  while(cost()>budget.triangles){
   let best:Candidate|undefined,saved=0;
   for(const c of accepted){if(c.lod>=2)continue;const b=this.batches.get(c.module)!,delta=c.mounts.length*(b[c.lod].triangles-b[c.lod+1].triangles);if(delta>saved){saved=delta;best=c;}}
   limited=true;if(best)best.lod++;else if(accepted.length)accepted.pop();else break;
  }
  const submitted=new Set<string>();let instances=0,triangles=0;
  for(const batches of this.batches.values())for(const b of batches){b.mesh.count=0;b.mesh.visible=false;}
  this.status.lods={Arch:-1,Pillar:-1,Trim:-1};
  for(const c of accepted){const b=this.batches.get(c.module)![c.lod];
   for(const [i,mount]of c.mounts.entries()){this.matrix.multiplyMatrices(mount.matrix,b.local);b.mesh.setMatrixAt(i,this.matrix);submitted.add(mount.placement.id);}
   b.mesh.count=c.mounts.length;b.mesh.visible=true;b.mesh.instanceMatrix.needsUpdate=true;instances+=b.mesh.count;triangles+=b.mesh.count*b.triangles;this.status.lods[c.module]=c.lod;
  }
  // Preserve original fallbacks for budget-omitted visible replacements; culled
  // decoration has neither the old nor the new renderable submitted.
  for(const p of placements)for(const old of this.options.fallbacks?.get(p.id)??[])old.visible=visible.has(p.id)&&!submitted.has(p.id)&&(this.previousVisibility.get(old)??false);
  Object.assign(this.status,{instances,draws:accepted.length,triangles,budgetLimited:limited});
 }
 private async parse(url:string,hash:string,signal:AbortSignal){
  const response=await fetch(url,{signal});if(!response.ok)throw Error('Architecture download unavailable');const bytes=await response.arrayBuffer();
  if(!crypto.subtle||!/^[a-f0-9]{64}$/.test(hash))throw Error('Architecture hash unavailable');
  const digest=await crypto.subtle.digest('SHA-256',bytes);if(Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')!==hash)throw Error('Architecture hash mismatch');
  return new GLTFLoader().setKTX2Loader(this.ktx).setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,url.slice(0,url.lastIndexOf('/')+1));
 }
 private inspect(root:T.Group){
  root.updateMatrixWorld(true);const found=new Map<ArchitectureModule,T.Mesh[]>(),materials=new Set<T.Material>();
  root.traverse(o=>{if(o instanceof T.Mesh){const moduleName=o.userData.module as ArchitectureModule,lod=o.userData.lod;if(!MODULES.includes(moduleName)||!Number.isInteger(lod)||lod<0||lod>2||Array.isArray(o.material))throw Error('Invalid architecture module');
   const list=found.get(moduleName)??[];if(list[lod])throw Error('Duplicate architecture LOD');list[lod]=o;found.set(moduleName,list);materials.add(o.material);
   const triangles=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;if(!Number.isInteger(triangles)||triangles<=0||triangles>TARGETS[moduleName][lod])throw Error('Architecture triangle budget exceeded');
  }else if(o instanceof T.Light)throw Error('Runtime architecture must not add lights');});
  if(materials.size!==1||MODULES.some(m=>[0,1,2].some(lod=>!found.get(m)?.[lod])))throw Error('Incomplete shared architecture contract');
  const asset=root.getObjectByName('AshenArchitectureKit');if(!asset||asset.position.length()>1e-5||asset.quaternion.angleTo(new T.Quaternion())>1e-5||asset.scale.distanceTo(new T.Vector3(1,1,1))>1e-5)throw Error('Invalid architecture pivot');
  const anchors={Arch_Ground:[0,0,0],Pillar_Ground:[0,0,0],Trim_Ground:[0,0,0],OpeningLeft:[-3,0,0],OpeningRight:[3,0,0],OpeningTop:[0,6.8,0]};
  for(const [name,point]of Object.entries(anchors)){let anchor:T.Object3D|undefined;root.traverse(o=>{if(o.userData.semantic_name===name)anchor=o;});if(!anchor||anchor.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(point[0],point[1],point[2]))>1e-4)throw Error('Invalid architecture anchor');}
  return found;
 }
 private async load(placements:ArchitecturePlacement[]){
  const generation=++this.generation,request=this.request=new AbortController();this.status.state='loading';let root:T.Group|null=null;
  const stale=()=>this.disposed||generation!==this.generation||request.signal.aborted;
  try{
   let manifest=this.manifest;if(!manifest){const r=await fetch(ARCHITECTURE_MANIFEST_URL,{signal:request.signal});if(!r.ok)throw Error('Architecture manifest unavailable');manifest=await r.json() as Manifest;if(!stale())this.manifest=manifest;}
   if(stale())return;const asset=manifest.assets.architecture;let found:Map<ArchitectureModule,T.Mesh[]>|undefined,fallback=false;
   for(const variant of [0,1]){
    try{const gltf=await this.parse(variant?asset.fallback_url:asset.compressed_url,variant?asset.fallback_sha256:asset.sha256,request.signal);root=gltf.scene;if(stale()){disposeTree(root,true);return;}found=this.inspect(root);fallback=variant===1;break;}
    catch(error){if(root){disposeTree(root,true);root=null;}if(stale())return;if(variant)throw error;}
   }
   if(!root||!found)throw Error('Architecture unavailable');
   const mounts:Mount[]=placements.map(placement=>{const matrix=new T.Matrix4().compose(new T.Vector3(...placement.position),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),placement.yaw),new T.Vector3(1,1,1)),bounds=new T.Box3();for(const mesh of found!.get(placement.module)!)bounds.union(new T.Box3().setFromObject(mesh));bounds.applyMatrix4(matrix);return {placement,matrix,bounds,center:bounds.getCenter(new T.Vector3())};});
   const batches=new Map<ArchitectureModule,Batch[]>();
   for(const moduleName of MODULES){const capacity=placements.filter(p=>p.module===moduleName).length;batches.set(moduleName,found.get(moduleName)!.map(source=>{const mesh=new T.InstancedMesh(source.geometry,source.material,Math.max(1,capacity));mesh.name=`Higgsfield ${moduleName} LOD${source.userData.lod}`;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.count=0;mesh.visible=false;return {mesh,local:source.matrixWorld.clone(),triangles:(source.geometry.index?.count??source.geometry.attributes.position.count)/3};}));}
   this.template=root;root=null;this.batches=batches;this.mounts=mounts;
   for(const p of placements)for(const old of this.options.fallbacks?.get(p.id)??[])if(!this.previousVisibility.has(old))this.previousVisibility.set(old,old.visible);
   for(const list of batches.values())for(const b of list)this.world.scene.add(b.mesh);
   Object.assign(this.status,{state:fallback?'ready: PNG fallback':'ready: compressed',version:manifest.version,sourceProject:asset.source_project_id,sourceRevision:asset.source_revision,residentInstances:mounts.length});this.retryCount=0;this.retryAt=0;this.clock=1;this.invalidate();
  }catch{if(root)disposeTree(root,true);if(!stale()){this.release();this.status.state='failed';this.retryAt=this.now()+Math.min(60000,10000*2**this.retryCount++);this.invalidate();}}
 }
 private release(){
  this.generation++;this.request?.abort();this.request=null;
  for(const [old,visible]of this.previousVisibility)old.visible=visible;this.previousVisibility.clear();
  for(const list of this.batches.values())for(const b of list){b.mesh.removeFromParent();b.mesh.dispose();}this.batches.clear();
  if(this.template)disposeTree(this.template,true);this.template=null;this.mounts=[];this.lods={Arch:-1,Pillar:-1,Trim:-1};
  Object.assign(this.status,{state:'unloaded',residentInstances:0,instances:0,draws:0,triangles:0,lods:{Arch:-1,Pillar:-1,Trim:-1},budgetLimited:false});
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.release();this.ktx.dispose();}
}

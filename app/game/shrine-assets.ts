import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {disposeTree} from './character-assets';
import {roomAt} from './dungeon';
import type {WorldScene} from './world';

type Asset={compressed_url:string;fallback_url:string;sha256:string;fallback_sha256:string;source_project_id:string;source_revision:number};
type Shrine=WorldScene['shrines'][number];
export type ShrineState='dormant'|'lit'|'off';
type Fixture={shrine:Shrine;fallback:{mesh:T.Mesh;visible:boolean}[];position:T.Vector3;roomId:string|undefined};
type Mounted={fixture:Fixture;root:T.Group;lods:T.Object3D[];ember:T.MeshStandardMaterial;lod:number;state:ShrineState};
export const SHRINE_MANIFEST_URL='/assets/props/v2/manifest.json';
export function selectShrineLod(distance:number,pixels:number,current:number){
  if(distance<(current===0?9.5:8.5))return 0;
  if(distance<(current===1?21:18)&&pixels>(current===1?35:45))return 1;
  return 2;
}

function materialRole(mesh:T.Mesh){
  if(Array.isArray(mesh.material)||!(mesh.material instanceof T.MeshStandardMaterial))throw Error('Shrine requires one standard material per mesh');
  const role=mesh.userData.surface_role;
  if((role!=='body'&&role!=='ember')||mesh.material.userData.surface_role!==role)throw Error('Shrine surface role missing');
  return role as 'body'|'ember';
}
function inspectTemplate(root:T.Group,asset:Asset){
  root.updateMatrixWorld(true);const runtime=root.getObjectByName('EmberShrine_Runtime');
  if(!runtime||runtime.userData.source_project_id!==asset.source_project_id||runtime.userData.source_revision!==asset.source_revision)throw Error('Shrine source binding mismatch');
  const lods:T.Object3D[]=[];let lights=0;root.traverse(o=>{if(o instanceof T.Light)lights++;if(Number.isInteger(o.userData.lod)){const i=o.userData.lod;if(i<0||i>2||lods[i])throw Error('Duplicate shrine LOD');lods[i]=o;}});
  if(lights||lods.length!==3||[0,1,2].some(i=>!lods[i]))throw Error('Incomplete shrine LOD/light contract');
  const bodies=new Set<T.Material>(),embers=new Set<T.Material>();
  for(const lod of lods){const meshes:T.Mesh[]=[];lod.traverse(o=>{if(o instanceof T.Mesh)meshes.push(o);});if(meshes.length!==2)throw Error('Shrine must use two draws per LOD');const roles=meshes.map(materialRole).sort();if(roles.join(',')!=='body,ember')throw Error('Incomplete shrine surfaces');for(const mesh of meshes)(materialRole(mesh)==='body'?bodies:embers).add(mesh.material as T.Material);}
  if(bodies.size!==1||embers.size!==1)throw Error('Shrine materials must be shared across LODs');
  const anchors:{[name:string]:number[]}={Ground:[0,0,0],FlameOrigin:[0,1.9,0],LightOrigin:[0,2.2,0],EmberCore:[0,1.54,0]};
  for(const[name,point]of Object.entries(anchors)){const anchor=root.getObjectByName(name);if(!anchor||anchor.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3().fromArray(point))>1e-4)throw Error('Shrine anchor mismatch: '+name);}
  const triangles=lods.map(lod=>{let total=0;lod.traverse(o=>{if(o instanceof T.Mesh){const geometry=o.geometry,count=geometry.index?.count??geometry.getAttribute('position').count;total+=Math.floor(Math.max(0,Math.min(count-geometry.drawRange.start,geometry.drawRange.count))/3);}});return total;});
  return {ember:[...embers][0] as T.MeshStandardMaterial,triangles};
}

/** Decoration only. World code retains sole ownership of the flame, light and interaction state. */
export class ShrineAssets {
  private enabled=true;private disposed=false;private generation=0;private request:AbortController|null=null;
  private template:T.Group|null=null;private mounted:Mounted[]=[];private fixtures:Fixture[];private states=new Map<string,ShrineState>();
  private ktx:KTX2Loader;private clock=1;private lastNeeded=false;private budgetDraws=2;private budgetTriangles=5936;private trianglesByLod:number[]=[];
  readonly status={enabled:true,state:'unloaded',version:null as string|null,sourceProject:null as string|null,sourceRevision:null as number|null,instances:0,visibleInstances:0,draws:0,triangles:0,budgetDraws:2,budgetTriangles:5936,visibleLods:[0,0,0]};
  constructor(private world:WorldScene,renderer:T.WebGLRenderer,private invalidate:()=>void,awakened:readonly string[]=[]){
    this.ktx=new KTX2Loader().setTranscoderPath('/assets/decoders/three-r180/').setWorkerLimit(1).detectSupport(renderer);
    this.fixtures=world.shrines.map(shrine=>{
      const fallback:{mesh:T.Mesh;visible:boolean}[]=[];
      shrine.group.traverse(o=>{if(!(o instanceof T.Mesh))return;let n:T.Object3D|null=o;while(n&&n!==shrine.group){if(n===shrine.flame)return;n=n.parent;}fallback.push({mesh:o,visible:o.visible});});
      const position=shrine.group.getWorldPosition(new T.Vector3());return {shrine,fallback,position,roomId:roomAt(position.x,position.z)?.id};
    });
    this.setAwakened(awakened);
  }
  setAwakened(ids:readonly string[]){const lit=new Set(ids);for(const f of this.fixtures)this.setState(f.shrine.id,lit.has(f.shrine.id)?'lit':'dormant');}
  setState(id:string,state:ShrineState){
    if(this.disposed||!this.fixtures.some(f=>f.shrine.id===id))return;
    this.states.set(id,state);for(const mount of this.mounted)if(mount.fixture.shrine.id===id)this.applyState(mount,state);this.invalidate();
  }
  private applyState(mount:Mounted,state:ShrineState){
    mount.state=state;mount.ember.emissive.set(state==='lit'?'#8cd6ec':'#d08239');mount.ember.emissiveIntensity=state==='off'?0:state==='lit'?.8:.55;
  }
  setEnabled(value:boolean){if(this.disposed)return;this.enabled=value;this.status.enabled=value;if(!value)this.release();this.lastNeeded=false;this.invalidate();}
  /** Conservative import budget; world-owned fallback geometry is outside this new-prop budget. */
  setBudget(draws:number,triangles:number){
    if(this.disposed)return;const d=Number.isFinite(draws)?Math.max(0,Math.floor(draws)):0,t=Number.isFinite(triangles)?Math.max(0,Math.floor(triangles)):0;
    if(d===this.budgetDraws&&t===this.budgetTriangles)return;this.budgetDraws=this.status.budgetDraws=d;this.budgetTriangles=this.status.budgetTriangles=t;this.clock=1;this.invalidate();
  }
  update(camera:T.PerspectiveCamera,playerX:number,playerZ:number,outputHeight:number,dt:number){
    if(this.disposed||!this.enabled)return;
    for(const f of this.fixtures)f.shrine.group.getWorldPosition(f.position);
    const nearest=Math.min(...this.fixtures.map(f=>Math.hypot(f.position.x-playerX,f.position.z-playerZ))),needed=nearest<28;
    if(!needed&&nearest>44&&(this.template||this.status.state==='loading'))this.release();
    if(needed&&!this.lastNeeded&&this.status.state==='failed')this.status.state='unloaded';this.lastNeeded=needed;
    if(needed&&this.status.state==='unloaded')void this.load();
    if(!this.template)return;
    this.clock+=Math.max(0,dt);if(this.clock<.12&&dt>0)return;this.clock=0;
    const room=roomAt(playerX,playerZ)?.id,counts=[0,0,0];let visible=0,triangles=0;
    const ordered=this.mounted.slice().sort((a,b)=>a.fixture.position.distanceToSquared(camera.position)-b.fixture.position.distanceToSquared(camera.position));
    for(const mount of ordered){
      const f=mount.fixture,distance=f.position.distanceTo(camera.position),playerDistance=Math.hypot(f.position.x-playerX,f.position.z-playerZ);
      mount.root.visible=((room!==undefined&&room===f.roomId)||playerDistance<12)&&distance<38;
      const pixels=outputHeight*1.78/(Math.max(1,distance)*2*Math.tan(T.MathUtils.degToRad(camera.fov/2)));
      mount.lod=selectShrineLod(distance,pixels,mount.lod);
      while(mount.lod<2&&triangles+this.trianglesByLod[mount.lod]>this.budgetTriangles)mount.lod++;
      mount.root.visible=mount.root.visible&&(visible+1)*2<=this.budgetDraws&&triangles+this.trianglesByLod[mount.lod]<=this.budgetTriangles;
      mount.lods.forEach((o,i)=>o.visible=i===mount.lod);
      for(const fallback of f.fallback)fallback.mesh.visible=mount.root.visible?false:fallback.visible;
      if(mount.root.visible){visible++;counts[mount.lod]++;triangles+=this.trianglesByLod[mount.lod];}
    }
    this.status.visibleLods=counts;this.status.visibleInstances=visible;this.status.draws=visible*2;this.status.triangles=triangles;
  }
  private async parse(url:string,hash:string,signal:AbortSignal){
    const response=await fetch(url,{signal});if(!response.ok)throw Error('Shrine download unavailable');const bytes=await response.arrayBuffer();
    if(crypto.subtle){const digest=await crypto.subtle.digest('SHA-256',bytes);if([...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')!==hash)throw Error('Shrine hash mismatch');}
    return new GLTFLoader().setKTX2Loader(this.ktx).setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,url.slice(0,url.lastIndexOf('/')+1));
  }
  private async load(){
    const generation=++this.generation,request=this.request=new AbortController();this.status.state='loading';let root:T.Group|null=null;const staged:Mounted[]=[];
    const stale=()=>this.disposed||request.signal.aborted||generation!==this.generation;
    try{
      const response=await fetch(SHRINE_MANIFEST_URL,{signal:request.signal});if(!response.ok)throw Error('Shrine manifest unavailable');const manifest=await response.json() as {version:string;assets:{shrine:Asset}};
      if(stale())return;const asset=manifest.assets?.shrine;
      if(!asset||!asset.compressed_url||!asset.fallback_url||!asset.sha256||!asset.fallback_sha256||!asset.source_project_id||!Number.isInteger(asset.source_revision))throw Error('Shrine manifest incomplete');
      let contract:ReturnType<typeof inspectTemplate>|undefined,fallback=false;
      for(const [url,hash,isFallback]of [[asset.compressed_url,asset.sha256,false],[asset.fallback_url,asset.fallback_sha256,true]] as const){
        try{
          root=(await this.parse(url,hash,request.signal)).scene;
          if(stale()){disposeTree(root,true);root=null;return;}
          contract=inspectTemplate(root,asset);fallback=isFallback;break;
        }catch(error){if(root){disposeTree(root,true);root=null;}if(stale())return;if(isFallback)throw error;}
      }
      if(!root||!contract)throw Error('Shrine contract unavailable');
      for(const fixture of this.fixtures){
        const instance=root.clone(true),ember=contract.ember.clone(),lods:T.Object3D[]=[];
        instance.name='Runtime shrine '+fixture.shrine.id;instance.userData.shrineId=fixture.shrine.id;instance.visible=false;
        instance.traverse(o=>{if(Number.isInteger(o.userData.lod))lods[o.userData.lod]=o;if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;if(materialRole(o)==='ember')o.material=ember;}});
        const mount={fixture,root:instance,lods,ember,lod:-1,state:'dormant' as ShrineState};this.applyState(mount,this.states.get(fixture.shrine.id)??'dormant');staged.push(mount);
      }
      if(stale()){for(const mount of staged)mount.ember.dispose();disposeTree(root,true);root=null;return;}
      this.template=root;this.mounted=staged;this.trianglesByLod=contract.triangles;root=null;
      for(const mount of staged)mount.fixture.shrine.group.add(mount.root);
      this.status.version=manifest.version;this.status.sourceProject=asset.source_project_id;this.status.sourceRevision=asset.source_revision;this.status.state=fallback?'ready: PNG fallback':'ready: compressed';this.status.instances=staged.length;this.clock=1;root=null;this.invalidate();
    }catch{
      if(root){for(const mount of staged)mount.ember.dispose();disposeTree(root,true);root=null;}
      if(!stale()){this.release();this.status.state='failed';this.invalidate();}
    }
  }
  private release(){
    this.generation++;this.request?.abort();this.request=null;
    for(const mount of this.mounted){mount.root.removeFromParent();mount.ember.dispose();for(const f of mount.fixture.fallback)f.mesh.visible=f.visible;}this.mounted=[];
    if(this.template)disposeTree(this.template,true);this.template=null;this.status.state='unloaded';this.status.instances=0;this.status.visibleInstances=0;this.status.draws=0;this.status.triangles=0;this.trianglesByLod=[];this.status.visibleLods=[0,0,0];
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.release();this.ktx.dispose();this.status.state='disposed';}
}

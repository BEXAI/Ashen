import { applyWorldSurfaceUV } from './surface-uv';
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ROOMS, CORRIDORS } from './dungeon';
import type { WorldScene } from './world';

export type RoomChunk={id:string;z:number;depth:number;group:T.Group;loaded:boolean};
export const CHUNK_REGIONS=[...ROOMS.map(r=>({id:r.id,z:r.z,depth:r.depth})),...CORRIDORS.map((r,i)=>({id:`passage-${i}`,z:r.z,depth:r.depth}))];
function regionAt(z:number){return CHUNK_REGIONS.find(r=>Math.abs(z-r.z)<=r.depth/2+.6)??CHUNK_REGIONS.reduce((a,b)=>Math.abs(a.z-z)<Math.abs(b.z-z)?a:b);}

/** Architecture remains a separate BVH; visible meshes are material batches per room. */
export function buildDungeonArt(world:WorldScene):RoomChunk[]{
 const {scene,architecture}=world,stone=world.surfaces.find(s=>s.family==='wall')!.material;
 stone.name='masonry';world.surfaces.find(s=>s.family==='floor')!.material.name='floor';
 const iron=new T.MeshStandardMaterial({color:'#423e37',metalness:.78,roughness:.55});iron.name='aged_iron';
 const cloth=new T.MeshStandardMaterial({color:'#451d21',roughness:1,side:T.DoubleSide});cloth.name='oxblood_cloth';
 const clay=new T.MeshStandardMaterial({color:'#66594b',roughness:.94});clay.name='burial_clay';
 const dark=new T.MeshStandardMaterial({color:'#272b2b',roughness:.96});dark.name='soot';
 const bone=new T.MeshStandardMaterial({color:'#b8aa8a',roughness:.88});bone.name='burial_bone';
 const chunks=CHUNK_REGIONS.map(r=>({...r,group:new T.Group(),loaded:false}));chunks.forEach(c=>{c.group.name=`room-${c.id}`;scene.add(c.group);});
 const chunkFor=(z:number)=>chunks.find(c=>c.id===regionAt(z).id)!;
 function prop(g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number,rx=0,ry=0,rz=0){const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,rz);mesh.castShadow=true;mesh.receiveShadow=true;chunkFor(z).group.add(mesh);return mesh;}
 // Shallow wall-mounted burial details leave the existing walkable footprint clear.
 for(const [i,room]of ROOMS.entries()){
  for(const side of [-1,1]){
   const x=side*(room.width/2-.22);
   // Reliefs sit above the combat lane, attached to the existing wall plane.
   for(const height of [2.35,6.9])prop(new RoundedBoxGeometry(.18,.16,room.depth-1.2,2,.035),stone,x,height,room.z);
   for(let j=0;j<4;j++){
    const z=room.z+(j-1.5)*(room.depth-3)/4;
    if(i===0){
     prop(new RoundedBoxGeometry(.16,2.9,.25,2,.045),stone,x,4.1,z);
     prop(new T.TorusGeometry(.32,.055,6,16),stone,x-side*.07,5.8,z,0,Math.PI/2);
    }else if(i===1){
     prop(new RoundedBoxGeometry(.2,2.1,.78,2,.06),dark,x,3.9,z);
     prop(new T.TorusGeometry(.24,.034,6,16),iron,x-side*.14,4.6,z,0,Math.PI/2);
     prop(new RoundedBoxGeometry(.08,1.3,.085,1,.016),iron,x-side*.16,3.65,z);
    }else if(i===2){
     for(let row=0;row<3;row++){
      const skull=new T.SphereGeometry(1,12,10);skull.scale(.15,.20,.17);
      prop(skull,bone,x-side*.08,2.9+row*.47,z);
      for(const eye of [-1,1]){const socket=new T.SphereGeometry(1,8,6);socket.scale(.018,.042,.042);prop(socket,dark,x-side*.225,2.94+row*.47,z+eye*.065);}
      prop(new RoundedBoxGeometry(.1,.09,.2,1,.018),bone,x-side*.17,2.72+row*.47,z);
     }
    }else if(i===3){
     prop(new T.TorusGeometry(.64,.07,6,20),stone,x,4.4,z,0,Math.PI/2);
     prop(new T.TorusGeometry(.31,.04,6,16),iron,x-side*.07,4.4,z,0,Math.PI/2);
     prop(new RoundedBoxGeometry(.13,1.7,.15,2,.025),stone,x,5.4,z);
    }else{
     for(let k=0;k<3;k++)prop(new T.ConeGeometry(.19,1.1+(k===1?.65:0),6),stone,x,3.8,z+(k-1)*.38,0,0,side*.1);
     prop(new RoundedBoxGeometry(.22,.2,1.3,2,.03),iron,x,3.15,z);
    }
   }
   for(let j=0;j<3;j++){
    const z=room.z+(j-1)*5.2;
    prop(new RoundedBoxGeometry(.48,1.15,2.7,2,.08),stone,x,1.2,z);
    prop(new RoundedBoxGeometry(.54,.16,2.9,2,.04),stone,x,1.82,z);
    const urnProfile=[[.10,0],[.22,.06],[.30,.35],[.26,.6],[.12,.68],[.13,.78]].map(([r,y])=>new T.Vector2(r,y));
    prop(new T.LatheGeometry(urnProfile,12),clay,side*(room.width/2-.05),2.0,z);
   }
   if(i>0){
    const banner=new T.PlaneGeometry(1.3,2.8,6,8),p=banner.attributes.position;
    for(let j=0;j<p.count;j++){p.setZ(j,Math.sin(p.getX(j)*14)*.045);if(p.getY(j)<-1.35)p.setY(j,p.getY(j)+.1+.16*Math.sin(j*17)**2);}banner.computeVertexNormals();
    prop(banner,cloth,side*(room.width/2-.5),5.7,room.z+6,0,side<0?Math.PI/2:-Math.PI/2);
   }
   for(let j=0;j<7;j++){
    const xj=side*(room.width/2-.22),z=room.z+(j-3)*2.3;
    prop(new T.DodecahedronGeometry(.13+(j%3)*.05,0),stone,xj,.09,z,j,0,j*.4);
   }
   // Ring chains are grouped into the room's iron batch.
   for(let j=0;j<15;j++)prop(new T.TorusGeometry(.075,.017,4,8),iron,side*2.9,7.4-j*.16,room.z-room.depth/2+1,0,j%2*Math.PI/2,0);
  }
  // A narrow central relief frames the sight line without obstructing combat lanes.
  if(i===3)for(const side of [-1,1])prop(new T.CylinderGeometry(.07,.1,3.6,8),iron,side*3,1.8,room.z-7);
 }
 // Crown, flanking spires and stepped base strengthen the throne silhouette.
 for(const side of [-1,1]){
  prop(new RoundedBoxGeometry(.55,4.9,.7,2,.07),stone,side*1.65,2.75,-80);
  prop(new T.ConeGeometry(.35,1.2,6),iron,side*1.65,5.8,-80);
 }
 for(let i=0;i<5;i++)prop(new T.ConeGeometry(.10,.5+(2-Math.abs(i-2))*.13,6),iron,(i-2)*.44,4.6,-80);
 // Geometry for contact shadows is static. Moving gates and actors never enter this batch.
 const dynamic=new Set<T.Object3D>([...world.gates,world.hero.group,world.keeper.group,world.reflector,...world.fires.map(f=>f.flame),...world.shrines.map(s=>s.group),...world.chests.map(c=>c.group)]);
 for(const object of [...scene.children]){
  if(dynamic.has(object)||object===architecture||!(object instanceof T.Mesh))continue;
  if(object instanceof T.InstancedMesh){for(let i=0;i<object.count;i++){const matrix=new T.Matrix4();object.getMatrixAt(i,matrix);matrix.premultiply(object.matrix);const copy=new T.Mesh(object.geometry.clone(),object.material);matrix.decompose(copy.position,copy.quaternion,copy.scale);chunkFor(copy.position.z).group.add(copy);}scene.remove(object);object.geometry.dispose();continue;}
  const box=new T.Box3().setFromObject(object),z=box.getCenter(new T.Vector3()).z;chunkFor(z).group.add(object);
 }
 const source=architecture.geometry,arrays=new Map<string,{position:number[];normal:number[];uv:number[]}>();
 const count=source.index?.count??source.attributes.position.count;
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(j=>source.index?source.index.getX(i+j):i+j),z=ids.reduce((s,k)=>s+source.attributes.position.getZ(k),0)/3;
  const id=regionAt(z).id,a=arrays.get(id)??{position:[],normal:[],uv:[]};arrays.set(id,a);
  for(const k of ids){a.position.push(source.attributes.position.getX(k),source.attributes.position.getY(k),source.attributes.position.getZ(k));a.normal.push(source.attributes.normal.getX(k),source.attributes.normal.getY(k),source.attributes.normal.getZ(k));a.uv.push(source.attributes.uv.getX(k),source.attributes.uv.getY(k));}
 }
 for(const [id,a]of arrays){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(a.position,3));g.setAttribute('normal',new T.Float32BufferAttribute(a.normal,3));g.setAttribute('uv',new T.Float32BufferAttribute(a.uv,2));chunks.find(c=>c.id===id)!.group.add(new T.Mesh(g,stone));}
 architecture.visible=false;
 // Merge stable material siblings only, keeping rooms independently cullable.
 for(const chunk of chunks){
  const batches=new Map<T.Material,T.BufferGeometry[]>();
  chunk.group.updateMatrixWorld(true);
  for(const object of [...chunk.group.children]){
   if(!(object instanceof T.Mesh)||Array.isArray(object.material))continue;
   object.updateMatrix();let g=object.geometry.clone().applyMatrix4(object.matrix);if(g.index){const expanded=g.toNonIndexed();g.dispose();g=expanded;}
   if(world.surfaces.some(s=>s.material===object.material&&(s.family==='wall'||s.family==='floor')))applyWorldSurfaceUV(g);
   const p=g.attributes.position,colors=new Float32Array(p.count*3);
   for(let i=0;i<p.count;i++){
    const y=p.getY(i),variation=.94+.035*Math.sin(p.getX(i)*1.7+p.getZ(i)*.8),damp=T.MathUtils.smoothstep(y,.1,2.2)*.09+.9;
    colors.set([variation*damp,variation*damp*(y<1.2?.985:1),variation*damp*(y<1.2?1.01:1)],i*3);
   }
   g.setAttribute('color',new T.BufferAttribute(colors,3));
   if(object.material instanceof T.MeshStandardMaterial)object.material.vertexColors=true;
   const list=batches.get(object.material)??[];list.push(g);batches.set(object.material,list);chunk.group.remove(object);object.geometry.dispose();
  }
  for(const [material,geometries]of batches){const g=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());const m=new T.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;m.name=material.name||material.type;chunk.group.add(m);}
 }
 world.materials.push(iron,cloth,clay,dark,bone);
 return chunks;
}

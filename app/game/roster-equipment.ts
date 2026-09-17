import * as T from 'three';
import type {RosterId} from './character-roster';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Modeled replacements for props omitted by single-view reconstruction. Dimensions are meters. */
export function attachRosterEquipment(instance:T.Object3D,id:RosterId,modelScale=1){
 const owned:T.Group[]=[];
 const steel=new T.MeshStandardMaterial({color:'#aab4bb',metalness:.8,roughness:.34});
 const brass=new T.MeshStandardMaterial({color:'#a98b55',metalness:.6,roughness:.55});
 const wood=new T.MeshStandardMaterial({color:'#392a21',roughness:.9});
 const materials:T.Material[]=[steel,brass,wood];
 function hand(name:string){
  const bone=instance.getObjectByName(name);if(!bone)return null;
  instance.updateMatrixWorld(true);const scale=bone.getWorldScale(new T.Vector3());
  const group=new T.Group();group.name='Authored '+id+' equipment';group.scale.set(modelScale/scale.x,modelScale/scale.y,modelScale/scale.z);bone.add(group);owned.push(group);return group;
 }
 function mesh(parent:T.Object3D,g:T.BufferGeometry,m:T.Material,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 function rod(parent:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,m:T.Material,tip=r){const d=b.clone().sub(a),o=mesh(parent,new T.CylinderGeometry(tip,r,d.length(),8),m);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;}
 const v=(x:number,y:number,z=0)=>new T.Vector3(x,y,z);
 function blade(parent:T.Group,length:number){
  rod(parent,v(0,-.14),v(0,.07),.024,wood);rod(parent,v(-.14,.07),v(.14,.07),.018,brass);
  const shape=new T.Shape([new T.Vector2(-.035,.09),new T.Vector2(.035,.09),new T.Vector2(.027,length-.11),new T.Vector2(0,length),new T.Vector2(-.027,length-.11)]);shape.closePath();
  mesh(parent,new T.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:true,bevelSize:.007,bevelThickness:.004,bevelSegments:1,steps:1}),steel,0,0,-.009);
  mesh(parent,new T.SphereGeometry(.034,8,6),brass,0,-.15);
 }
 if(['lion-knight','silver-knight','dusk-rogue','knife-rogue','skeleton-warrior'].includes(id)){
  const group=hand('RightHand');if(group)blade(group,id==='knife-rogue'?.7:1.05);
 }
 if(['sage','frost-mage','lich'].includes(id)){
  const group=hand('RightHand');if(group){
   group.rotation.z=Math.PI;
   const points=[v(0,-.83),v(.018,-.45),v(-.025,.04),v(.02,.54),v(0,1.07)];
   mesh(group,new T.TubeGeometry(new T.CatmullRomCurve3(points),20,.028,7,false),wood);
   for(let i=0;i<3;i++){const angle=i*Math.PI*2/3;rod(group,v(0,.86),v(Math.cos(angle)*.085,1.16,Math.sin(angle)*.085),.022,brass,.012);}
   const color=id==='sage'?'#ed993b':id==='frost-mage'?'#76cdf2':'#b191ea',gem=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.65,metalness:.15,roughness:.22});materials.push(gem);
   const crystal=mesh(group,new T.OctahedronGeometry(.105),gem,0,1.09);crystal.scale.set(.7,1.55,.7);crystal.name='EquippedMuzzle';
  }
 }
 if(id==='skeleton-warrior'){
  const shield=hand('LeftHand');if(shield){
   const bone=shield.parent!;bone.getWorldQuaternion(shield.quaternion).invert();shield.position.set(0,0,0);
   const red=new T.MeshStandardMaterial({color:'#793f36',roughness:.85,metalness:.2});materials.push(red);
   const disc=mesh(shield,new T.CylinderGeometry(.31,.31,.055,24),red,0,.07,.13);disc.rotation.x=Math.PI/2;
   mesh(shield,new T.TorusGeometry(.305,.016,5,24),steel,0,.07,.16);
   const boss=mesh(shield,new T.SphereGeometry(.09,12,8),steel,0,.07,.175);boss.scale.z=.5;
   for(let i=0;i<8;i++){const a=i*Math.PI/4;mesh(shield,new T.SphereGeometry(.013,5,4),brass,Math.cos(a)*.265,.07+Math.sin(a)*.265,.163);}
  }
 }
 // Every prop shares its hand transform. Merge by material to avoid a draw for
 // each shield rivet, staff prong and sword fitting, retaining muzzle anchors.
 for(const group of owned){
  const batches=new Map<T.Material,T.BufferGeometry[]>();
  for(const child of [...group.children])if(child instanceof T.Mesh&&!Array.isArray(child.material)){
   child.updateMatrix();let geometry=child.geometry.clone().applyMatrix4(child.matrix);if(geometry.index){const indexed=geometry;geometry=geometry.toNonIndexed();indexed.dispose();}const batch=batches.get(child.material)??[];batch.push(geometry);batches.set(child.material,batch);
   if(child.name){const marker=new T.Object3D();marker.name=child.name;marker.position.copy(child.position);marker.quaternion.copy(child.quaternion);marker.scale.copy(child.scale);group.add(marker);}
   child.geometry.dispose();child.removeFromParent();
  }
  for(const [material,geometries]of batches){const geometry=mergeGeometries(geometries);if(!geometry)throw Error('Unable to merge character equipment');mesh(group,geometry,material);geometries.forEach(g=>g.dispose());}
 }
 return ()=>{for(const group of owned){group.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});group.removeFromParent();}materials.forEach(m=>m.dispose());};
}

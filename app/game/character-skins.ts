import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type SkinId='ash-knight'|'crypt-warden'|'ember-sovereign';
export type ActorVisual={beginFrame:()=>void;present:(dt:number,ground:number,reducedMotion:boolean)=>void;resetPresentation:()=>void;strike:(strike:import('./combat').Strike,elapsed:number)=>void;locomotion:(time:number,moving:number)=>void;reaction:(kind:'hit'|'dodge'|'death',elapsed:number)=>void;lod:(distance:number,pixels:number)=>void;segment:(base:T.Vector3,tip:T.Vector3)=>void;dispose:()=>void};
export type Actor={group:T.Group,body:T.Object3D,torso:T.Object3D,legs:T.Object3D[],knees:T.Object3D[],arms:T.Object3D[],elbows:T.Object3D[],wrists:T.Object3D[],sword:T.Object3D,cape:T.Mesh,eye:T.Mesh,visual?:ActorVisual};
type Family='steel'|'hide'|'obsidian'|'bone'|'cloth'|'mail';
export const SKIN_SOURCE='a4887158-9444-42f8-9573-ce2581d8495e';

// These are articulated, full-volume reconstructions of the Higgsfield sheet.
// Body parts are merged per joint/material to keep mobile draw calls bounded.
export function knight(enemy=false,boss=false,authoringDetail=false):Actor {
 const id:SkinId=boss?'ember-sovereign':enemy?'crypt-warden':'ash-knight';
 const monster=enemy&&!boss;
 const group=new T.Group(),body=new T.Group();group.add(body);group.name=id;group.userData.skin=id;
 function material(name:string,color:string,metalness:number,roughness:number,family?:Family){
  const m=new T.MeshStandardMaterial({color,metalness,roughness});m.name=name;
  if(family)m.userData.skinFamily=family;return m;
 }
 const armor=material('armor',boss?'#5c5656':monster?'#a4a3a0':'#b9bec5',monster?0: .85,monster?.9:.48,boss?'obsidian':monster?'hide':'steel');
 const bone=material('bone','#c9bc9e',.04,.89,'bone');
 const trim=material('worn edges',boss?'#6e5548':'#a68b69',.72,.6);
 const hide=material('undersuit',monster?'#a4a3a0':'#55514c',0,.94,monster?'hide':'mail');
 const cloth=material('tattered cloth',boss?'#4b3530':'#955758',0,.98,'cloth');cloth.side=T.DoubleSide;
 const dark=material('leather','#30251f',0,.88);
 const fire=material('embers','#29100a',.1,.5);fire.emissive.set('#ff5c16');fire.emissiveIntensity=boss?2.4:.9;
 const bladeMat=material('blade',boss?'#6b4031':'#bfc4cb',.88,.32,boss?'obsidian':'steel');
 function mesh(g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1,parent:T.Object3D=body){
  const o=new T.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
 }
 function oval(m:T.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number,parent:T.Object3D=body){return mesh(new T.SphereGeometry(1,authoringDetail?24:16,authoringDetail?16:12),m,x,y,z,sx,sy,sz,parent);}
 function rod(m:T.Material,a:number[],b:number[],r:number,parent:T.Object3D=body,tip=r){
  const start=new T.Vector3(...a),end=new T.Vector3(...b),d=end.clone().sub(start);
  const o=mesh(new T.CylinderGeometry(tip,r,d.length(),authoringDetail?8:6),m,...start.clone().add(end).multiplyScalar(.5).toArray(),1,1,1,parent);
  o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;
 }
 function plate(m:T.Material,points:number[][],x:number,y:number,z:number,parent:T.Object3D=body,depth=.055){
  const s=new T.Shape(points.map(p=>new T.Vector2(p[0],p[1])));s.closePath();
  const g=new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.022,bevelThickness:.014,bevelSegments:authoringDetail?3:1,steps:1});
  g.computeBoundingBox();const box=g.boundingBox!,uv=g.attributes.uv,pos=g.attributes.position;
  for(let i=0;i<pos.count;i++)uv.setXY(i,(pos.getX(i)-box.min.x)/Math.max(.01,box.max.x-box.min.x),(pos.getY(i)-box.min.y)/Math.max(.01,box.max.y-box.min.y));
  if(authoringDetail&&m===armor&&!monster){
   for(const [px,py]of points.filter((_,i)=>i%2===0))mesh(new T.SphereGeometry(.012,6,4),trim,x+px*.8,y+py*.8,z+depth+.008,1,1,.45,parent);
  }
  return mesh(g,m,x,y,z,1,1,1,parent);
 }
 // Anatomical torso, collar, pelvis and back remain fully modeled from every angle.
 oval(hide,0,1.52,0,.36,.52,.22);oval(hide,0,1.03,0,.32,.2,.22);
 oval(hide,0,2.09,0,.14,.21,.14);
 if(monster){
  for(const side of [-1,1]){
   oval(armor,side*.17,1.78,.09,.23,.18,.18);
   for(let i=0;i<4;i++)oval(armor,side*.09,1.55-i*.105,.18,.11,.073,.065);
   for(let i=0;i<5;i++){
    const y=1.91-i*.13;
    if(authoringDetail){
     const curve=new T.CatmullRomCurve3([new T.Vector3(side*.015,y,.245),new T.Vector3(side*.17,y-.04,.31),new T.Vector3(side*(.22+Math.sin(i*.7)*.08),y-.09,.21)]);
     mesh(new T.TubeGeometry(curve,8,.029,6,false),bone,0,0,0);
    }else rod(bone,[side*.015,y,.245],[side*(.22+Math.sin(i*.7)*.08),y-.09,.25],.035);
   }
   rod(bone,[side*.26,1.0,.13],[side*.36,1.25,.03],.055,body,.008);
  }
  rod(bone,[0,1.35,.26],[0,1.99,.26],.046);
 }else{
  oval(armor,0,1.69,0,.43,.4,.255);
  for(const side of [-1,1])plate(armor,[[0,.23],[side*.36,.17],[side*.39,-.04],[side*.16,-.22],[0,-.13]],0,1.8,.22);
  for(let i=0;i<4;i++){
   const w=.33-i*.024;
   plate(armor,[[-w,.09],[-w*.85,-.07],[0,-.14],[w*.85,-.07],[w,.09],[0,.02]],0,1.52-i*.12,.235);
   if(boss&&i<3)rod(fire,[-w*.65,1.52-i*.12,.298],[0,1.43-i*.12,.298],.009);
  }
  rod(dark,[-.34,1.96,.27],[.31,1.17,.28],.04);
  oval(dark,0,1.13,0,.36,.064,.255);
  plate(trim,[[-.065,.055],[.065,.055],[.065,-.055],[-.065,-.055]],.1,1.13,.29);
 }
 // A shaped helmet or bare skull, with separate eye sockets and jaw.
 oval(armor,0,2.38,0,.205,.275,.19);
 if(monster){
  oval(armor,0,2.23,.055,.15,.145,.16);
  for(const side of [-1,1]){
   oval(dark,side*.083,2.405,.17,.066,.046,.037);
   rod(armor,[side*.02,2.46,.185],[side*.15,2.46,.15],.027);
   oval(armor,side*.13,2.3,.145,.06,.07,.055);
   rod(bone,[side*.15,2.42,0],[side*.24,2.48,.01],.05,body,.003);
  }
  plate(dark,[[-.025,.04],[.025,.04],[.017,-.03],[-.017,-.03]],0,2.33,.205);
  for(let i=0;i<7;i++)rod(bone,[(i-3)*.027,2.23,.204],[(i-3)*.027,2.195,.207],.009);
 }else{
  for(const side of [-1,1]){
   plate(armor,[[0,.27],[side*.16,.21],[side*.2,.01],[side*.15,-.18],[0,-.26]],0,2.39,.12);
   plate(armor,[[0,.02],[side*.17,.04],[side*.16,-.17],[0,-.23]],0,2.35,.195);
   rod(dark,[side*.025,2.39,.257],[side*.155,2.41,.225],.017);
   for(let i=0;i<3;i++)rod(dark,[side*(.045+i*.035),2.29,.26],[side*(.045+i*.035),2.23,.26],.006);
  }
 }
 const eyeParts=[-1,1].map(s=>{const g=new T.SphereGeometry(.025,8,6);g.scale(1.15,.52,.5);g.translate(s*.079,2.405,.215);return g;});
 const eyeGeometry=mergeGeometries(eyeParts)!;eyeParts.forEach(g=>g.dispose());
 const eye=mesh(eyeGeometry,new T.MeshBasicMaterial({color:enemy?'#ff7b29':'#b8a584'}),0,0,0);
 if(!enemy)eye.visible=false;
 const legs:T.Group[]=[],knees:T.Group[]=[],arms:T.Group[]=[],elbows:T.Group[]=[],wrists:T.Group[]=[];
 for(const side of [-1,1]){
  const leg=new T.Group();leg.name=side<0?'left leg':'right leg';leg.position.set(side*.22,1.03,0);body.add(leg);legs.push(leg);
  oval(hide,0,-.22,0,.15,.28,.155,leg);oval(hide,0,-.67,0,.095,.25,.11,leg);
  oval(armor,0,-.49,.02,.125,.13,.14,leg);oval(armor,0,-.95,.09,.125,.08,.25,leg);
  if(monster){
   oval(armor,0,-.19,.02,.145,.26,.14,leg);oval(armor,0,-.65,-.02,.105,.26,.12,leg);
   rod(bone,[side*.11,-.04,.05],[side*.13,-.36,.02],.045,leg,.009);
   for(let j=0;j<4;j++)rod(bone,[(j-1.5)*.047,-.98,.24],[(j-1.5)*.05,-.99,.32],.021,leg,.004);
  }else{
   plate(armor,[[-.15,.13],[.15,.13],[.13,-.24],[0,-.3],[-.13,-.24]],0,-.14,.125,leg);
   plate(armor,[[-.11,.2],[.11,.2],[.08,-.2],[0,-.26],[-.08,-.2]],0,-.71,.115,leg);
   plate(armor,[[-.14,.05],[0,.12],[.14,.05],[.09,-.07],[0,-.11],[-.09,-.07]],0,-.49,.15,leg);
  }
  const arm=new T.Group();arm.name=side<0?'left arm':'right arm';arm.position.set(side*.47,1.97,0);body.add(arm);arms.push(arm);
  oval(hide,side*.035,-.24,0,.115,.27,.125,arm);oval(hide,side*.05,-.56,.01,.09,.22,.105,arm);
  oval(armor,side*.055,-.79,.025,.092,.12,.072,arm);
  if(monster){
   oval(bone,0,-.02,-.01,.21,.14,.19,arm);
   for(let j=0;j<3;j++)rod(bone,[side*j*.065,.03,-.02],[side*(j*.09+.045),.21+j*.03,-.035],.064,arm,.004);
   plate(bone,[[-.1,.15],[0,.23],[.11,.12],[.07,-.2],[0,-.26],[-.065,-.16]],side*.05,-.56,.095,arm);
   for(let j=0;j<4;j++)rod(bone,[side*.055+(j-1.5)*.038,-.85,.07],[side*.06+(j-1.5)*.042,-1.01,.105],.019,arm,.003);
  }else{
   oval(armor,0,-.015,0,.23,.16,.22,arm);
   for(let j=0;j<(boss?4:3);j++)plate(armor,[[-.18,.06],[.18,.06],[.16,-.09],[0,-.14],[-.16,-.09]],side*.035,-.12-j*.082,.14,arm);
   plate(armor,[[-.105,.18],[.105,.18],[.085,-.15],[0,-.21],[-.085,-.15]],side*.05,-.59,.103,arm);
   if(boss){
    for(let j=0;j<3;j++)rod(armor,[side*j*.065,.02,-.01],[side*(.15+j*.065),.3-j*.035,-.02],.075,arm,.002);
    rod(fire,[-.09,-.01,.2],[.09,-.12,.2],.008,arm);
   }
  }
 }
 // Split distal pieces at anatomical pivots without changing their rest positions.
 for(let i=0;i<2;i++){
  const side=i===0?-1:1,arm=arms[i],elbow=new T.Group(),wrist=new T.Group(),knee=new T.Group();
  elbow.name=i===0?'left elbow':'right elbow';elbow.position.set(side*.05,-.43,0);
  wrist.name=i===0?'left wrist':'right wrist';wrist.position.set(side*.005,-.34,.025);
  for(const child of [...arm.children]){
   if(child.position.y<-.72){child.position.sub(new T.Vector3(side*.055,-.77,.025));wrist.add(child);}
   else if(child.position.y<-.4){child.position.sub(elbow.position);elbow.add(child);}
  }
  elbow.add(wrist);arm.add(elbow);elbows.push(elbow);wrists.push(wrist);
  knee.name=i===0?'left knee':'right knee';knee.position.set(0,-.49,0);
  for(const child of [...legs[i].children])if(child.position.y<-.49){child.position.sub(knee.position);knee.add(child);}
  legs[i].add(knee);knees.push(knee);
 }
 const sword=new T.Group();sword.name=monster?'bone mace':'greatsword';sword.position.set(-.015,-.1,.02);sword.rotation.x=-.8;wrists[1].add(sword);
 rod(dark,[0,.06,0],[0,-.34,0],.033,sword);
 if(monster){
  rod(dark,[0,-.3,0],[0,-1.1,0],.045,sword);
  oval(bone,0,-1.05,0,.14,.2,.14,sword);
  for(let j=0;j<4;j++){const a=j*Math.PI/2;rod(bone,[0,-1.03,0],[Math.cos(a)*.26,-1.16,Math.sin(a)*.26],.105,sword,.014);}
 }else{
  rod(trim,[-.22,-.22,0],[.22,-.22,0],.027,sword);
  plate(bladeMat,boss?[[-.065,0],[.11,-.07],[.2,-.92],[.06,-1.28],[-.1,-1.12],[-.16,-.92],[-.07,-1.0]]:[[-.045,0],[.045,0],[.045,-1.03],[0,-1.23],[-.045,-1.03]],0,-.25,-.018,sword,.028);
  if(boss)rod(fire,[.024,-.35,.03],[.12,-1.22,.03],.012,sword);
 }
 // Torn silhouette is geometry, not transparency: stable shadows and no alpha sorting.
 const capeGeometry=new T.PlaneGeometry(.79,1.5,10,14),pos=capeGeometry.attributes.position;
 for(let i=0;i<pos.count;i++){
  if(pos.getY(i)<-.73)pos.setY(i,pos.getY(i)+(.07+.13*(Math.sin(i*7.1)*.5+.5)));
  if(authoringDetail)pos.setZ(i,Math.sin(pos.getX(i)*34)*.035*(1.05-pos.getY(i)*.4));
 }
 capeGeometry.computeVertexNormals();
 const cape=mesh(capeGeometry,cloth,0,1.48,-.285);cape.rotation.x=.12;cape.visible=!monster;
 if(!monster){
  for(const side of [-1,1])plate(armor,[[0,.14],[side*.26,.1],[side*.29,-.33],[side*.1,-.4],[0,-.25]],side*.08,1.02,.21);
 }
 if(boss){
  for(let i=0;i<7;i++){const a=(i/6-.5)*Math.PI*1.5;rod(trim,[Math.sin(a)*.18,2.56,Math.cos(a)*.16],[Math.sin(a)*.22,2.91-Math.abs(i-3)*.035,Math.cos(a)*.2],.035,body,.009);}
  group.scale.setScalar(1.8);
 }
 // The chest twists from the waist, independently of planted feet and hips.
 const torso=new T.Group();torso.name='torso';torso.position.y=1.22;
 for(const child of [...body.children])if(!legs.includes(child as T.Group)){child.position.y-=1.22;torso.add(child);}
 body.add(torso);
 // Merge only static siblings: articulation and dynamic cape/eyes remain independent.
 for(const parent of [body,torso,...legs,...knees,...arms,...elbows,...wrists,sword]){
  const batches=new Map<T.Material,T.Mesh[]>();
  for(const child of parent.children){if(!(child instanceof T.Mesh)||child===cape||child===eye)continue;const m=child.material as T.Material;const list=batches.get(m)||[];list.push(child);batches.set(m,list);}
  for(const [mat,parts] of batches){
   if(parts.length<2)continue;
   const gs=parts.map(p=>{p.updateMatrix();const g=p.geometry.clone().applyMatrix4(p.matrix);if(!g.index)return g;const expanded=g.toNonIndexed();g.dispose();return expanded;});
   const merged=mergeGeometries(gs);gs.forEach(g=>g.dispose());if(!merged)continue;
   parts.forEach(p=>{parent.remove(p);p.geometry.dispose();});mesh(merged,mat,0,0,0,1,1,1,parent);
  }
 }
 return {group,body,torso,legs,knees,arms,elbows,wrists,sword,cape,eye};
}

export class CharacterTextures {
 private stopped=false;private textures=new Set<T.Texture>();
 constructor(private scene:T.Scene,private onError:()=>void,private invalidate:()=>void){}
 async load(){
  const loader=new T.TextureLoader(),materials=new Map<Family,T.MeshStandardMaterial[]>();
  this.scene.traverse(o=>{if(!(o instanceof T.Mesh))return;for(const m of Array.isArray(o.material)?o.material:[o.material]){const family=m.userData.skinFamily as Family|undefined;if(!family)continue;const list=materials.get(family)||[];if(!list.includes(m))list.push(m);materials.set(family,list);}});
  let failed=false;
  await Promise.all([...materials].map(async([family,mats])=>{
   try{
    const load=(path:string)=>new Promise<T.Texture>((resolve,reject)=>{const t=loader.load(path,resolve,undefined,reject);this.textures.add(t);});
    const [color,height]=await Promise.all([load(`/assets/skins/${family}.webp`),load(`/assets/skins/${family}-height.png`)]);
    if(this.stopped){color.dispose();height.dispose();return;}
    color.colorSpace=T.SRGBColorSpace;
    for(const t of [color,height]){t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=2;}
    for(const m of mats){m.map=color;m.bumpMap=height;m.bumpScale=family==='hide'?.024:.012;m.needsUpdate=true;}
    this.invalidate();
   }catch{failed=true;}
  }));
  if(failed&&!this.stopped)this.onError();
 }
 dispose(){this.stopped=true;this.textures.forEach(t=>t.dispose());this.textures.clear();}
}

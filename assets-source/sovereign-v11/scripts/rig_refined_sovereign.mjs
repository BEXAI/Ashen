/** Retrofit the authored static sovereign to the existing game skeleton and clips.
 * Run: node script.mjs --game /path/to/game --static /path/mobile.glb --parts geometry_budget.json --out /path/out
 * Existing game bones, weapon and 389/390 animation channels are preserved; only dodge/cape_lower/rotation changes. No source game writes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const argv=process.argv.slice(2),arg=(n,d)=>argv.includes(n)?argv[argv.indexOf(n)+1]:d;
const game=path.resolve(arg('--game',process.cwd())),input=arg('--static'),partsPath=arg('--parts'),out=arg('--out');
if(!input||!partsPath||!out)throw Error('Supply --static, --parts and --out');
const imp=async p=>import(pathToFileURL(path.join(game,'node_modules',p)));
const [{NodeIO},{ALL_EXTENSIONS},{mergeDocuments,prune,dedup,simplifyPrimitive,weldPrimitive},{MeshoptSimplifier},T,{default:validator}]=await Promise.all([imp('@gltf-transform/core/dist/index.js'),imp('@gltf-transform/extensions/dist/index.js'),imp('@gltf-transform/functions/dist/index.js'),imp('meshoptimizer/index.js'),imp('three/build/three.module.js'),imp('gltf-validator/index.js')]);
await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(arg('--rig-source',path.join(game,'assets-source/characters/ember-sovereign.glb'))),source=await io.read(input),parts=JSON.parse(await fs.readFile(partsPath,'utf8'));
const refinement=arg('--refinement','on')!=='off';
const capeClearance=Number(arg('--cape-clearance','.20'));
const byPart=new Map(parts.filter(r=>r.part_index!==undefined).map(r=>[r.part_index,r.name]));
const scene=doc.getRoot().listScenes()[0],root=scene.listChildren()[0],skin=doc.getRoot().listSkins()[0],buffer=doc.getRoot().listBuffers()[0];
const lods=root.listChildren().filter(n=>Number.isInteger(n.getExtras().lod)).sort((a,b)=>a.getExtras().lod-b.getExtras().lod);
const originalClipSignatures=doc.getRoot().listAnimations().map(a=>({name:a.getName(),samplers:a.listSamplers().length,channels:a.listChannels().length}));
const acc=(type,array)=>doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
// Extract precisely the old triangles rigidly bound to the weapon joint.
function extractWeapon(p){
 const joints=p.getAttribute('JOINTS_0'),weights=p.getAttribute('WEIGHTS_0'),indices=p.getIndices().getArray(),keep=[];
 const weaponVertex=i=>{const j=joints.getElement(i,[]),w=weights.getElement(i,[]);return j.some((v,k)=>v===12&&w[k]>.99);};
 for(let i=0;i<indices.length;i+=3)if([indices[i],indices[i+1],indices[i+2]].every(weaponVertex))keep.push(indices[i],indices[i+1],indices[i+2]);
 const q=p.clone();q.setIndices(acc('SCALAR',new Uint32Array(keep)));weldPrimitive(q);return q;
}
// P12 authored correction is isolated to the existing lower cape bone in
// dodge. Inputs, clip duration, all body/weapon/contact tracks stay original.
const capeDodgeRadians=Number(arg('--cape-dodge-radians','.18'));
if(refinement&&capeDodgeRadians){
 const dodge=doc.getRoot().listAnimations().find(a=>a.getName()==='dodge');
 for(const channel of dodge.listChannels())if(channel.getTargetNode().getName()==='cape_lower'&&channel.getTargetPath()==='rotation'){
  const sampler=channel.getSampler(),input=sampler.getInput(),old=sampler.getOutput(),values=new Float32Array(old.getCount()*4),duration=input.getScalar(input.getCount()-1);
  for(let i=0;i<old.getCount();i++){
   const t=input.getScalar(i)/duration,angle=capeDodgeRadians*Math.sin(Math.PI*t)**2;
   const q=new T.Quaternion().fromArray(old.getElement(i,[])).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),angle)).normalize();
   q.toArray(values,i*4);
  }
  sampler.setOutput(acc('VEC4',values));
 }
}
const weapon=extractWeapon(lods[0].getMesh().listPrimitives()[0]);
const weaponTriangles=weapon.getIndices().getCount()/3;
const mapping=mergeDocuments(doc,source),newMesh=mapping.get(source.getRoot().listMeshes()[0]),p=newMesh.listPrimitives()[0];
for(const s of doc.getRoot().listScenes())if(s!==scene)s.dispose();
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
function interp(x,points){let i=1;while(i<points.length-1&&x>points[i][0])i++;const [a,b]=[points[i-1],points[i]];return a[1]+(x-a[0])/(b[0]-a[0])*(b[1]-a[1]);}
const bodyY=y=>interp(y,[[0,0],[.54,.54],[1.03,1.03],[1.13,1.25],[1.25,1.57],[1.48,1.97],[1.66,2.20],[1.88,2.62],[2.234,2.97]]);
const armY=y=>interp(y,[[.80,.87],[1.045,1.20],[1.245,1.54],[1.48,1.97],[1.7,2.35]]);
function armPoint([x,y,z]){
 const sx=interp(y,[[.8,.455],[1.045,.399],[1.245,.337],[1.48,.245],[1.7,.26]]),tx=interp(y,[[.8,.535],[1.045,.525],[1.245,.52],[1.48,.47],[1.7,.48]]);
 return [Math.sign(x)*(tx+(Math.abs(x)-sx)*1.45),armY(y),z*(1.3-.5*(1-smooth(.92,1.07,y)))+.015*smooth(1.3,1.05,y)];
}
function bodyPoint([x,y,z]){return [x*(1.375+.475*smooth(1.03,1.47,y)),bodyY(y),z*(1.35+.1*smooth(1.05,1.48,y))];}
function category(name,pos){
 if(/cape/.test(name))return 'cape';
 if(/pauldron|arm shell|vambrace|hand and finger|elbow cop|closed arm strap|strap stud|shoulder defense/.test(name))return 'arm';
 if(/anatomical padded body/.test(name))return 'body';
 return 'central';
}
function transform(v,name){
 const [x,y,z]=v,c=category(name,v);
 if(c==='arm')return armPoint(v);
 if(c==='cape'){
  const yy=interp(y,[[0,0],[1.56,2.15]]),xx=x*1.8;
  // Keep shoulder attachment at its authored location, then open the lower
  // drape behind the leg sweep. A smooth negative-Z offset adds clearance.
  const lower=1-smooth(1.45,2.12,yy);
  const clearance=refinement?capeClearance*(.45*lower+.55*lower*lower):0;
  return [xx,yy,z*1.3-clearance];
 }
 if(c==='body'){
  const threshold=interp(y,[[.8,.285],[1.05,.28],[1.25,.235],[1.48,.20],[1.65,.26]]),w=smooth(threshold-.025,threshold+.015,Math.abs(x))*(1-smooth(1.48,1.58,y));
  const a=armPoint(v),b=bodyPoint(v);return a.map((x,k)=>x*w+b[k]*(1-w));
 }
 return bodyPoint(v);
}
function influence(v,name,mapped){
 const [x,y,z]=v,right=x>=0,leg=right?3:1,knee=right?4:2,arm=right?9:6,elbow=right?10:7,wrist=right?11:8,c=category(name,v);
 const blend=(a,b,t)=>[[a,1-clamp(t)],[b,clamp(t)]].filter(i=>i[1]>.00001);
 if(c==='cape')return blend(13,14,clamp((1.7-mapped[1])/.8));
 if(c==='arm'){
  if(/hand and finger/.test(name))return [[wrist,1]];
  if(/pauldron|shoulder defense/.test(name)){
   // Each armor object has one uniform influence pair, so plate vertices do
   // not tear independently. Upper cap partly follows the torso; distal lames
   // follow the arm progressively. The weapon chain remains untouched.
   const layer=/pauldron rivet/.test(name)?Math.floor(Number(name.match(/\.(\d+)$/)?.[1]??0)/2):Number(name.match(/pauldron (?:edge )?(\d)/)?.[1]??3);
   if(refinement&&(layer<2||/shoulder defense/.test(name)))return blend(5,arm,/shoulder defense/.test(name)?.84:layer===0?.84:.96);
   return [[arm,1]];
  }
  if(/arm shell/.test(name))return [[arm,1]];
  if(/elbow cop|vambrace/.test(name))return [[elbow,1]];
  return y>1.25?[[arm,1]]:y>1.025?[[elbow,1]]:[[wrist,1]];
 }
 if(c==='body'){
  if(refinement&&y>1.29&&y<1.61){
   // Continuous torso-to-deltoid weights across the shared underarmor mesh.
   // Blend in source anatomical space; no binary shoulder seam at y=1.54.
   const sideWeight=smooth(.16,.275,Math.abs(x));
   const heightWeight=1-smooth(1.50,1.61,y);
   const armWeight=sideWeight*heightWeight;
   return blend(5,arm,armWeight);
  }
  if(Math.abs(x)>interp(y,[[.8,.30],[1.05,.28],[1.25,.23],[1.48,.21],[1.66,.28]])&&y<1.54){
   if(y<1.12)return blend(wrist,elbow,smooth(1.005,1.10,y));
   return blend(elbow,arm,smooth(1.19,1.30,y));
  }
  if(y<1.06){if(y<.64)return blend(knee,leg,smooth(.50,.61,y));return blend(leg,0,smooth(.90,1.08,y));}
  return blend(0,5,smooth(1.06,1.16,y));
 }
 if(/thigh cuisse|hip tasset|tasset suspension|leather suspension|gathered oxblood|drape.*hem/.test(name))return blend(leg,0,smooth(.92,1.09,y));
 if(/shin greave|sabaton|patella|knee lame|greave flute/.test(name))return [[knee,1]];
 return [[5,1]];
}
const pos=p.getAttribute('POSITION'),nor=p.getAttribute('NORMAL'),tan=p.getAttribute('TANGENT'),part=p.getAttribute('_PART'),jarr=new Uint16Array(pos.getCount()*4),warr=new Float32Array(pos.getCount()*4),counts={};
const vec=new T.Vector3(),nv=new T.Vector3(),tv=new T.Vector3(),jac=new T.Matrix3(),normalMatrix=new T.Matrix3();
for(let i=0;i<pos.getCount();i++){
 const v=pos.getElement(i,[]),name=byPart.get(Math.round(part.getScalar(i)));if(!name)throw Error('Missing semantic part '+part.getScalar(i));
 const m=transform(v,name),w=influence(v,name,m);pos.setElement(i,m);
 const total=w.reduce((s,a)=>s+a[1],0);w.forEach(([j,w],k)=>{jarr[i*4+k]=j;warr[i*4+k]=w/total;counts[j]=(counts[j]??0)+w/total;});
 const cols=[0,1,2].map(k=>{const vv=[...v];vv[k]+=.00001;return transform(vv,name).map((x,j)=>(x-m[j])/.00001);});
 jac.set(cols[0][0],cols[1][0],cols[2][0],cols[0][1],cols[1][1],cols[2][1],cols[0][2],cols[1][2],cols[2][2]);
 normalMatrix.copy(jac).invert().transpose();nv.fromArray(nor.getElement(i,[])).applyMatrix3(normalMatrix).normalize();nor.setElement(i,nv.toArray());
 if(tan){const t=tan.getElement(i,[]);tv.fromArray(t).applyMatrix3(jac);tv.addScaledVector(nv,-tv.dot(nv));if(tv.lengthSq()<1e-10)tv.crossVectors(Math.abs(nv.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0),nv);tv.normalize();tan.setElement(i,[...tv.toArray(),t[3]]);}
}
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'near-part-indices.json'),JSON.stringify({parts:[...byPart],indices:Array.from(part.getArray())}));
p.setAttribute('_PART',null);p.setAttribute('JOINTS_0',acc('VEC4',jarr));p.setAttribute('WEIGHTS_0',acc('VEC4',warr));
const mat=p.getMaterial();mat.setExtras({...mat.getExtras(),environmentIntensity:.65,provenance:'Original scan-fitted sovereign armor; portable procedural material bake; existing game rig retrofit'});
mat.getBaseColorTexture().setName('sovereign_v10_base');mat.getNormalTexture().setName('sovereign_v10_normal');mat.getMetallicRoughnessTexture().setName('sovereign_v10_orm');mat.getEmissiveTexture().setName('sovereign_v10_emissive');
for(const t of doc.getRoot().listTextures())if(!t.getName().startsWith('sovereign_v10'))t.setName('retained_weapon_'+t.getName().split('_').pop());
const triangles=[];
for(let i=0;i<3;i++){
 const prim=i?p.clone():p;
 if(i)simplifyPrimitive(prim,{simplifier:MeshoptSimplifier,ratio:i===1?.55:.28,error:i===1?.008:.025,lockBorder:false});
 const mesh=doc.createMesh('Sovereign_LOD'+i).addPrimitive(prim).addPrimitive(weapon.clone());
 lods[i].setMesh(mesh).setSkin(skin);triangles.push(mesh.listPrimitives().reduce((s,p)=>s+p.getIndices().getCount()/3,0));
}
// Dispose orphan imported node so it cannot keep an unskinned clone alive.
for(const n of doc.getRoot().listNodes())if(n.getMesh()===newMesh)n.dispose();
await doc.transform(prune({keepLeaves:true,keepAttributes:true}),dedup());
for(const a of doc.getRoot().listAccessors())a.setBuffer(buffer);
for(const b of doc.getRoot().listBuffers())if(b!==buffer)b.dispose();
const result=await io.writeBinary(doc);await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'ember-sovereign-rigged-master.glb'),result);
const report=await validator.validateBytes(new Uint8Array(result),{maxIssues:100});
if(report.issues.numErrors)throw Error(JSON.stringify(report.issues,null,2));
const final={refinement:{capeClearanceMetres:capeClearance,capeDodgeRadians,changedAnimationChannels:refinement&&capeDodgeRadians?['dodge/cape_lower/rotation']:[],frozen:'All other animation channels, clip input times, original skeleton/inverse binds and weapon sockets'},bytes:result.length,triangles,materials:doc.getRoot().listMaterials().length,meshes:doc.getRoot().listMeshes().length,weaponTriangles,bones:skin.listJoints().map(j=>j.getName()),clips:originalClipSignatures,validation:report.issues,weightedVertexCounts:counts,limits:'Semantic rigid-plate retrofit with blended underarmor/cape; not animator-authored weights. 389/390 animation channels retained exactly; only dodge/cape_lower/rotation receives a bounded authored correction. Runtime device frame rate must be measured.'};
await fs.writeFile(path.join(out,'rigged_metrics.json'),JSON.stringify(final,null,2));console.log(JSON.stringify(final,null,2));

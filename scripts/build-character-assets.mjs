// Reproducible authored reconstruction assets. These are not Meshy-generated sculpts.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { weldPrimitive, simplifyPrimitive, dedup, meshopt, cloneDocument, tangents, unweld, weld } from '@gltf-transform/functions';
import * as Mikk from 'three/addons/libs/mikktspace.module.js';
import {unwrap,raster,dilate,visibilitySampler} from './asset-baking.mjs';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import validator from 'gltf-validator';

await mkdir('.sites-runtime/assets',{recursive:true});
await mkdir('assets-source/characters',{recursive:true});
await mkdir('public/assets/characters/v9',{recursive:true});
await mkdir('public/assets/decoders/three-r180',{recursive:true});
for(const name of ['basis_transcoder.js','basis_transcoder.wasm'])
  await copyFile(`node_modules/three/examples/jsm/libs/basis/${name}`,`public/assets/decoders/three-r180/${name}`);
await build({stdin:{contents:'export {knight} from "./app/game/character-skins";export {animateActor} from "./app/game/world";export {applyStrikePose} from "./app/game/combat-animation";export {STRIKES,strikeDuration} from "./app/game/combat";export * as T from "three";',resolveDir:process.cwd()},outfile:'.sites-runtime/assets/authoring.mjs',bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {knight,animateActor,applyStrikePose,STRIKES,strikeDuration,T}=await import(pathToFileURL(resolve('.sites-runtime/assets/authoring.mjs')));
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready,Mikk.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const manifest={version:'visual-v9',status:'authored_reconstructions_pending_rendered_art_review',method:'Detailed articulated geometry with area-weighted xatlas UVs, 4K source atlases, geometric hemisphere AO, authored microstructure and Higgsfield diffuse material imagery. This is not a completed premium anatomical sculpt.',sourceJob:'a4887158-9444-42f8-9573-ce2581d8495e',sources:'assets-source/characters',characters:{},license:'Original project-authored geometry and material fields; user-requested Higgsfield design and material generation. No external character model used.'};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

function textureFields(material,u,v,seed){
 const family=material.userData.skinFamily,noise=Math.sin(u*713+seed)*Math.sin(v*971+u*31),fine=Math.sin(u*3101+v*271)*Math.sin(v*2443);
 const seam=Math.abs(Math.sin(u*39+Math.sin(v*21)*.7));
 const cloth=family==='cloth'||family==='mail',stone=family==='obsidian'||family==='bone'||family==='hide';
 const weave=cloth?Math.sin(u*900)*Math.sin(v*900):0;
 const scar=Math.pow(Math.max(0,Math.sin(u*147+Math.sin(v*19)*2)),32)*.45;
 const height=cloth?weave*.15:noise*.045+fine*.015+scar*(stone?.18:.035);
 const color=material.color.clone();
 // Linear pigment variation, not painted highlights or extracted image luminance.
 color.multiplyScalar(1+(cloth?.09:.05)*noise-(stone?.12:.035)*scar);
 const fracture=family==='obsidian'&&seam<.026;
 const emission=material.emissive?.clone()??new T.Color(0);
 if(fracture)emission.setRGB(.75,.085,.008);
 return {color,height,roughness:Math.min(1,Math.max(.18,(material.roughness??.75)+noise*.055+scar*.13)),metalness:fracture?0:(material.metalness??0),emission};
}
async function atlas(materials,size,id,primitive){
 const buffers=Object.fromEntries(['base','normal','orm','emissive'].map(k=>[k,Buffer.alloc(size*size*4)])),mask=new Uint8Array(size*size);
 const pos=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL'),sourceUv=primitive.getAttribute('TEXCOORD_0'),packedUv=primitive.getAttribute('TEXCOORD_1');
 const visibility=visibilitySampler(pos.getArray(),primitive.getIndices().getArray()),ao=new Float32Array(pos.getCount()),point=new T.Vector3(),n=new T.Vector3();
 for(let i=0;i<pos.getCount();i++)ao[i]=visibility.sample(point.fromArray(pos.getArray(),i*3),n.fromArray(normal.getArray(),i*3).normalize(),.42,32);
 visibility.dispose();
 const mainFamily=id==='ash-knight'?'steel':id==='crypt-warden'?'hide':'obsidian';
 const source=await sharp(`assets-source/materials/${mainFamily}.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const originalUv=sourceUv.getArray(),targetUv=packedUv.getArray();let lastIds,rotation=[1,0,0,1];
 raster(primitive,'TEXCOORD_1',size,(pixel,ids,a,b,c)=>{
  const u=(originalUv[ids[0]*2]*a+originalUv[ids[1]*2]*b+originalUv[ids[2]*2]*c)*4;
  const v=(originalUv[ids[0]*2+1]*a+originalUv[ids[1]*2+1]*b+originalUv[ids[2]*2+1]*c)*4;
  const slot=Math.min(materials.length-1,Math.floor(v)*4+Math.floor(u)),m=materials[slot]??materials[0],su=u-Math.floor(u),sv=v-Math.floor(v);
  const f=textureFields(m,su,sv,slot),dx=textureFields(m,su+.001,sv,slot).height-f.height,dy=textureFields(m,su,sv+.001,slot).height-f.height;
  if(lastIds!==ids){
   lastIds=ids;const [i,j,k]=ids.map(v=>v*2),x1=targetUv[j]-targetUv[i],y1=targetUv[j+1]-targetUv[i+1],x2=targetUv[k]-targetUv[i],y2=targetUv[k+1]-targetUv[i+1],den=x1*y2-x2*y1;
   if(Math.abs(den)>1e-12){const s1=originalUv[j]-originalUv[i],t1=originalUv[j+1]-originalUv[i+1],s2=originalUv[k]-originalUv[i],t2=originalUv[k+1]-originalUv[i+1];rotation=[(s1*y2-s2*y1)/den,(t1*y2-t2*y1)/den,(s2*x1-s1*x2)/den,(t2*x1-t1*x2)/den];const scale=Math.sqrt(rotation.reduce((s,v)=>s+v*v,0)/2)||1;rotation=rotation.map(v=>v/scale);}
  }
  const nx=-(dx*rotation[0]+dy*rotation[1])*24,ny=(dx*rotation[2]+dy*rotation[3])*24,length=Math.sqrt(nx*nx+ny*ny+1);
  const color=f.color.convertLinearToSRGB(),emission=f.emission.convertLinearToSRGB(),at=pixel*4;
  let rgb=[color.r,color.g,color.b];
  if(m.userData.skinFamily===mainFamily){
   const x=Math.min(source.info.width-1,Math.floor(su*source.info.width)),y=Math.min(source.info.height-1,Math.floor(sv*source.info.height)),offset=(y*source.info.width+x)*4;
   rgb=rgb.map((v,k)=>v*.38+(source.data[offset+k]/255)*.62);
  }
  const values={base:rgb,normal:[nx/length*.5+.5,ny/length*.5+.5,1/length*.5+.5],orm:[ao[ids[0]]*a+ao[ids[1]]*b+ao[ids[2]]*c,f.roughness,f.metalness],emissive:[emission.r,emission.g,emission.b]};
  for(const [key,rgb]of Object.entries(values)){for(let k=0;k<3;k++)buffers[key][at+k]=Math.round(Math.max(0,Math.min(1,rgb[k]))*255);buffers[key][at+3]=255;}
  mask[pixel]=1;
 });
 dilate(Object.values(buffers),mask,size,20);
 const result={};for(const [key,bytes]of Object.entries(buffers)){result[key]=await sharp(bytes,{raw:{width:size,height:size,channels:4}}).png().toBuffer();await writeFile(`assets-source/characters/${id}-${key}.png`,result[key]);}
 primitive.setAttribute('TEXCOORD_0',packedUv);primitive.setAttribute('TEXCOORD_1',null);
 return {maps:result,ao:{min:Math.min(...ao),max:Math.max(...ao),samples:32,radius:.42},coverage:mask.reduce((s,v)=>s+v,0)/mask.length};
}

for(const [id,enemy,boss]of [['ash-knight',false,false],['crypt-warden',true,false],['ember-sovereign',true,true]]){
 const actor=knight(enemy,boss,true);actor.group.scale.setScalar(1);
 let capeUpper,capeLower;if(!enemy||boss){capeUpper=new T.Group();capeUpper.name='cape_upper';capeUpper.position.set(0,1,-.28);actor.torso.add(capeUpper);capeLower=new T.Group();capeLower.name='cape_lower';capeLower.position.set(0,-.7,-.06);capeUpper.add(capeLower);}
 actor.group.updateMatrixWorld(true);
 const bones=[];actor.group.traverse(o=>{if(o instanceof T.Group&&o!==actor.group)bones.push(o);});
 const names=['body','torso','left_leg','right_leg','left_knee','right_knee','left_arm','right_arm','left_elbow','right_elbow','left_wrist','right_wrist','weapon'];
 const ordered=[actor.body,actor.torso,...actor.legs,...actor.knees,...actor.arms,...actor.elbows,...actor.wrists,actor.sword];
 ordered.forEach((o,i)=>o.name=names[i]);
 const uniqueMaterials=[],meshes=[];
 actor.group.traverse(o=>{if(!(o instanceof T.Mesh)||(!o.visible&&o!==actor.eye))return;if(o===actor.eye&&!enemy)return;meshes.push(o);if(!uniqueMaterials.includes(o.material))uniqueMaterials.push(o.material);});
 if(uniqueMaterials.length>16)throw Error('Atlas slot budget exceeded');
 const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene(id),root=doc.createNode(id);scene.addChild(root);
 const nodes=new Map(bones.map(b=>[b,doc.createNode(b.name).setTranslation(b.position.toArray()).setRotation(b.quaternion.toArray()).setScale(b.scale.toArray()).setExtras({semantic:b.name})]));
 for(const b of bones)(nodes.get(b.parent)??root).addChild(nodes.get(b));
 const skin=doc.createSkin(id+'_skeleton');for(const b of bones)skin.addJoint(nodes.get(b));skin.setSkeleton(nodes.get(actor.body));
 const binds=bones.flatMap(b=>new T.Matrix4().copy(b.matrixWorld).invert().toArray());
 skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(new Float32Array(binds)).setBuffer(buffer));
 const positions=[],normals=[],uvs=[],joints=[],weights=[],indices=[];
 for(const m of meshes){
  const g=m.geometry,normalMatrix=new T.Matrix3().getNormalMatrix(m.matrixWorld),offset=positions.length/3,slot=uniqueMaterials.indexOf(m.material);
  let parent=m.parent;while(parent&&!nodes.has(parent))parent=parent.parent;const bone=Math.max(0,bones.indexOf(parent));
  for(let i=0;i<g.attributes.position.count;i++){
   positions.push(...new T.Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(m.matrixWorld).toArray());
   normals.push(...new T.Vector3().fromBufferAttribute(g.attributes.normal,i).applyNormalMatrix(normalMatrix).toArray());
   const u=g.attributes.uv.getX(i),v=g.attributes.uv.getY(i),padding=.018;
   uvs.push(((slot%4)+padding+(u-Math.floor(u===1?0:u))*(1-2*padding))/4,
     (Math.floor(slot/4)+padding+(1-(v-Math.floor(v===1?0:v)))*(1-2*padding))/4);
   if(m===actor.cape&&capeUpper){const y=positions[positions.length-2],lower=Math.max(0,Math.min(1,(1.7-y)/.8));joints.push(lower<1?bones.indexOf(capeUpper):0,lower>0?bones.indexOf(capeLower):0,0,0);weights.push(1-lower,lower,0,0);}
   else {joints.push(bone,0,0,0);weights.push(1,0,0,0);}
  }
  for(let i=0;i<(g.index?.count??g.attributes.position.count);i++)indices.push(offset+(g.index?g.index.getX(i):i));
 }
 const access=(type,array)=>doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
 const p=doc.createPrimitive().setAttribute('POSITION',access('VEC3',new Float32Array(positions))).setAttribute('NORMAL',access('VEC3',new Float32Array(normals))).setAttribute('TEXCOORD_0',access('VEC2',new Float32Array(uvs))).setAttribute('JOINTS_0',access('VEC4',new Uint16Array(joints))).setAttribute('WEIGHTS_0',access('VEC4',new Float32Array(weights))).setIndices(access('SCALAR',new Uint32Array(indices)));
 weldPrimitive(p);
 const uvReport=unwrap([p],doc,buffer,1024,5);
 console.log(id,'UV charts',uvReport.charts,'baking 4096px master');
 const baked=await atlas(uniqueMaterials,4096,id,p),maps=baked.maps,textures={};for(const [key,bytes]of Object.entries(maps))textures[key]=doc.createTexture(`${id}_${key}`).setMimeType('image/png').setImage(bytes);
 const mat=doc.createMaterial(id+'_PBR').setBaseColorTexture(textures.base).setNormalTexture(textures.normal).setNormalScale(.8).setOcclusionStrength(.78).setMetallicRoughnessTexture(textures.orm).setOcclusionTexture(textures.orm).setMetallicFactor(1).setRoughnessFactor(1).setEmissiveTexture(textures.emissive).setEmissiveFactor([1,1,1]).setDoubleSided(true).setExtras({environmentIntensity:.65,normalConvention:'OpenGL +Y',uvMethod:'xatlas',sourceMasterSize:4096});p.setMaterial(mat);
 const triangles=[];
 for(let lod=0;lod<3;lod++){
  const prim=lod?p.clone():p;if(lod)simplifyPrimitive(prim,{simplifier:MeshoptSimplifier,ratio:lod===1?.55:.27,error:.006,lockBorder:true});
  // Bake the same tangent basis into every LOD, including simplified seams.
  const tangentGeometry=new T.BufferGeometry();
  for(const [semantic,name,size]of [['POSITION','position',3],['NORMAL','normal',3],['TEXCOORD_0','uv',2]])tangentGeometry.setAttribute(name,new T.BufferAttribute(prim.getAttribute(semantic).getArray(),size));
  tangentGeometry.setIndex(new T.BufferAttribute(prim.getIndices().getArray(),1));
  tangentGeometry.computeTangents();
  const tangentArray=tangentGeometry.getAttribute('tangent').array;
  // Collapsed UV poles have no unique tangent; use a stable orthogonal basis.
  const normalAttribute=tangentGeometry.getAttribute('normal'),tangent=new T.Vector3(),normal=new T.Vector3(),axis=new T.Vector3();
  for(let vertex=0;vertex<normalAttribute.count;vertex++){
   const offset=vertex*4;tangent.fromArray(tangentArray,offset);
   if(tangent.lengthSq()<1e-12){normal.fromBufferAttribute(normalAttribute,vertex);axis.set(Math.abs(normal.y)<.9?0:1,Math.abs(normal.y)<.9?1:0,0);tangent.crossVectors(axis,normal).normalize();}
   else tangent.normalize();
   tangent.toArray(tangentArray,offset);tangentArray[offset+3]=tangentArray[offset+3]<0?-1:1;
  }
  if(!tangentArray.every(Number.isFinite))throw Error(`${id} LOD${lod} has invalid tangents`);
  prim.setAttribute('TANGENT',access('VEC4',new Float32Array(tangentArray)));
  tangentGeometry.dispose();
  triangles.push(prim.getIndices().getCount()/3);
  root.addChild(doc.createNode(`LOD${lod}`).setMesh(doc.createMesh(`LOD${lod}`).addPrimitive(prim)).setSkin(skin).setExtras({lod}));
 }
 nodes.get(actor.sword).addChild(doc.createNode('WeaponBase').setTranslation([0,-.28,.015]).setExtras({socket:'base'}));
 nodes.get(actor.sword).addChild(doc.createNode('WeaponTip').setTranslation([0,enemy&&!boss?-1.18:-1.43,.015]).setExtras({socket:'tip'}));
 const rest=bones.map(b=>({position:b.position.clone(),rotation:b.quaternion.clone()}));
 const clips=[...STRIKES.map(s=>({name:s.id,duration:strikeDuration(s),sample:t=>applyStrikePose(actor,s,t)})),
  ...[['idle',0],['forward',1],['backward',-.65],['strafe_left',.7],['strafe_right',.7],['turn',.2]].map(([name,moving])=>({name,duration:2*Math.PI/9,sample:t=>{animateActor(actor,t,moving,0);if(name==='turn')actor.torso.rotation.y=Math.sin(t*9)*.08;}})),
  {name:'dodge',duration:.5,sample:t=>{animateActor(actor,t,1,0);actor.body.rotation.x=-Math.sin(t/.5*Math.PI)*.5;}},
  {name:'hit',duration:.3,sample:t=>{animateActor(actor,0,0,0);actor.torso.rotation.x=-Math.sin(t/.3*Math.PI)*.13;}},
  {name:'death',duration:.8,sample:t=>{actor.body.rotation.z=Math.min(1,t/.8)*Math.PI/2;}}];
 for(const clip of clips){
  const count=Math.ceil(clip.duration*120)+1,strike=STRIKES.find(s=>s.id===clip.name),boundaries=strike?[strike.windup,strike.windup+strike.active,strike.windup+strike.active+strike.recovery*.45]:[];
  const times=[...new Set([...Array.from({length:count},(_,i)=>i/(count-1)*clip.duration),...boundaries])].sort((a,b)=>a-b),rotations=bones.map(()=>[]),translations=bones.map(()=>[]);
  for(const time of times){bones.forEach((b,i)=>{b.position.copy(rest[i].position);b.quaternion.copy(rest[i].rotation);});clip.sample(time);if(capeUpper){capeUpper.rotation.x=Math.sin(time*3)*.018+(clip.name==='forward'?.06:0);capeLower.rotation.x=Math.sin(time*4+.3)*.035+(clip.name==='forward'?.12:0);}bones.forEach((b,i)=>{rotations[i].push(...b.quaternion.toArray());translations[i].push(...b.position.toArray());});}
  const animation=doc.createAnimation(clip.name),input=access('SCALAR',new Float32Array(times));
  bones.forEach((b,i)=>{for(const [path,values,type]of [['rotation',rotations[i],'VEC4'],['translation',translations[i],'VEC3']]){
   const sampler=doc.createAnimationSampler().setInput(input).setOutput(access(type,new Float32Array(values))).setInterpolation('LINEAR');animation.addSampler(sampler);animation.addChannel(doc.createAnimationChannel().setTargetNode(nodes.get(b)).setTargetPath(path).setSampler(sampler));
  }});
 }
 // Never flatten, join skeleton nodes, or prune the weapon sockets.
 await doc.transform(unweld(),tangents({generateTangents:Mikk.generateTangents,overwrite:true}),weld(),dedup());
 // Keep full-resolution maps external in the editable master, avoiding a second
 // 50–60 MB copy of those same PNGs embedded in each source GLB.
 const editable=cloneDocument(doc);editable.getRoot().listBuffers().forEach(b=>b.setURI(`${id}.bin`));
 for(const texture of editable.getRoot().listTextures())texture.setURI(`${id}-${texture.getName().split('_').pop()}.png`);
 await io.write(`assets-source/characters/${id}.gltf`,editable);
 const preview=cloneDocument(doc);for(const texture of preview.getRoot().listTextures())texture.setImage(await sharp(texture.getImage()).resize(512,512).png().toBuffer());
 preview.getRoot().listScenes()[0].setExtras({fullResolutionMaster:`${id}.gltf`,previewTextureSize:512});
 await writeFile(`assets-source/characters/${id}.glb`,await io.writeBinary(preview));
 const variants={};
 for(const [tier,size]of [['low',512],['mobile',1024],['hd',2048],['high',id==='crypt-warden'?2048:4096]]){
  const variant=cloneDocument(doc);
  const textureSizes={};
  for(const texture of variant.getRoot().listTextures()){
   const kind=texture.getName().split('_').pop(),dimension=kind==='base'?size:kind==='emissive'?Math.min(512,size/4):Math.min(1024,size/2);
   textureSizes[kind]=dimension;texture.setImage(await sharp(texture.getImage()).resize(dimension,dimension).png().toBuffer());
  }
  const fallbackDoc=cloneDocument(variant);for(const texture of fallbackDoc.getRoot().listTextures()){const info=await sharp(texture.getImage()).metadata();if(info.width>1024)texture.setImage(await sharp(texture.getImage()).resize(1024,1024).png().toBuffer());}
  const fallback=await io.writeBinary(fallbackDoc),fallbackName=`${id}-${tier}-fallback.glb`;
  await writeFile(`public/assets/characters/v9/${fallbackName}`,fallback);
  const validate=await validator.validateBytes(new Uint8Array(fallback),{maxIssues:25});
  if(validate.issues.numErrors)throw Error(JSON.stringify(validate.issues));
  const encoder=process.env.ASHEN_TOKTX;
  let textureCompression='PNG';
  if(encoder){
   variant.createExtension(KHRTextureBasisu).setRequired(true);
   for(const [i,t]of variant.getRoot().listTextures().entries()){
    const input=resolve(`.sites-runtime/assets/${id}-${tier}-${i}.png`),output=input+'.ktx2';await writeFile(input,t.getImage());
    const dataMap=/normal|orm/.test(t.getName());
    const args=['--t2','--encode',dataMap?'uastc':'etc1s','--threads','2','--genmipmap','--assign_oetf',dataMap?'linear':'srgb'];
    if(dataMap)args.push('--uastc_quality','2','--zcmp','9');
    const run=spawnSync(encoder,[...args,output,input],{encoding:'utf8'});if(run.status!==0)throw Error(run.stderr||'KTX encoding failed');
    const encoded=await readFile(output);
    if(encoded.readUInt32LE(12)!==0||encoded.readUInt32LE(44)!==(dataMap?2:1))throw Error('Encoder did not produce the requested universal compressed texture');
    t.setImage(encoded).setMimeType('image/ktx2');
   }
   textureCompression='KTX2: ETC1S color/emissive, UASTC normal/ORM';
  }
  await variant.transform(meshopt({encoder:MeshoptEncoder,level:'medium'}));
  const bytes=await io.writeBinary(variant),name=`${id}-${tier}.glb`;await writeFile(`public/assets/characters/v9/${name}`,bytes);
  variants[tier]={url:`/assets/characters/v9/${name}`,fallback:`/assets/characters/v9/${fallbackName}`,bytes:bytes.length,fallbackBytes:fallback.length,sha256:hash(bytes),fallbackSha256:hash(fallback),textureSize:size,textureSizes,estimatedRgba8MipMiB:Object.values(textureSizes).reduce((s,n)=>s+n*n*4*4/3,0)/1048576,fallbackMaxTextureSize:1024,textureCompression,validationErrors:validate.issues.numErrors,validationWarnings:validate.issues.numWarnings};
 }
 manifest.characters[id]={status:'detailed_authored_reconstruction',uv:uvReport,geometricAO:baked.ao,masterTextureSize:4096,tangentBasis:'MikkTSpace',bounds:{min:[Math.min(...positions.filter((_,i)=>i%3===0)),Math.min(...positions.filter((_,i)=>i%3===1)),Math.min(...positions.filter((_,i)=>i%3===2))],height:boss?2.95:2.66},bones:bones.map(b=>b.name),boneCount:bones.length,weightsPerVertex:capeUpper?2:1,triangles,materialDrawsPerLod:1,sockets:['weapon','WeaponBase','WeaponTip'],clips:clips.map(c=>({name:c.name,duration:c.duration})),variants};
 console.log(id,JSON.stringify({triangles,bones:bones.length,bytes:variants.mobile.bytes}));
}
await writeFile('public/assets/characters/v9/manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('assets-source/characters/README.md','# Character masters\n\nEditable detailed reconstructions with xatlas UVs, 4096px master textures, 32-ray geometric occlusion, MikkTSpace tangents, bevels, rivets, curved ribs and folded cloth. Generated Higgsfield diffuse fields are retained in assets-source/materials with provenance; they are artistic textures, not measured PBR scans. Normal and roughness fields are separately authored. These are not new premium anatomical sculpts. Full rendered 360-degree and deformation review remains required. Runtime variants and memory estimates are in the v9 manifest.\n');

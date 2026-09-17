// Offline patch irradiance and geometric contact visibility, not path-traced GI.
import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Document,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {reorder,quantize,weldPrimitive} from '@gltf-transform/functions';
import {MeshoptEncoder} from 'meshoptimizer';
import {unwrap,raster,dilate,visibilitySampler} from './asset-baking.mjs';
async function compressRoom(doc){
 await doc.transform(reorder({encoder:MeshoptEncoder,target:'size'}),quantize({pattern:/^(?!TEXCOORD_1$).*/}));
 // Preserve continuous lightmap coordinates exactly. Quantizing them to 12 bits
 // introduced small overlaps at the edges of otherwise valid xatlas charts.
 doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
}
if(process.argv.includes('--repack-only')){
 await MeshoptEncoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
 const report=JSON.parse(await readFile('public/assets/dungeon/v9/manifest.json'));
 for(const room of report.rooms){const doc=await io.read(`assets-source/dungeon/${room.id}.glb`);await compressRoom(doc);const bytes=await io.writeBinary(doc);await writeFile('public'+room.url,bytes);room.bytes=bytes.length;room.sha256=createHash('sha256').update(bytes).digest('hex');room.lightmapUvComponentType='FLOAT32';room.shippedPaddingPixels=room.uv.padding*room.lightmapSize/Math.max(room.uv.width,room.uv.height);}
 report.method=report.method.replace('six-pixel padding','six atlas-pixel padding (over three shipped pixels)');
 await writeFile('public/assets/dungeon/v9/manifest.json',JSON.stringify(report,null,2)+'\n');process.exit(0);
}
await mkdir('.sites-runtime/assets',{recursive:true});await mkdir('assets-source/dungeon',{recursive:true});await mkdir('public/assets/dungeon/v9',{recursive:true});
await build({stdin:{contents:'export {createWorld} from "./app/game/world";export {newProgress} from "./app/game/model";export {ROOMS} from "./app/game/dungeon";export * as T from "three";',resolveDir:process.cwd()},outfile:'.sites-runtime/assets/dungeon-authoring.mjs',bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {createWorld,newProgress,ROOMS,T}=await import(pathToFileURL(resolve('.sites-runtime/assets/dungeon-authoring.mjs')));
T.TextureLoader.prototype.load=()=>new T.Texture();
const world=createWorld(newProgress(),'low'),io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});await MeshoptEncoder.ready;
world.scene.updateMatrixWorld(true);
const lights=world.fires.filter(f=>!world.shrines.some(s=>s.light===f.light)).map(f=>({position:f.light.getWorldPosition(new T.Vector3()),color:f.light.color,intensity:f.light.userData.baseIntensity}));
const report={version:'visual-v9',method:'Offline fixed-torch diffuse patch irradiance with architecture visibility, multiplied by 24-ray local geometric visibility. Contiguous xatlas UV1 charts with six atlas-pixel padding (over three shipped pixels) and dilation. No albedo in irradiance; no actors, gates or state-dependent shrine light. Not a path-traced/Cycles bake.',colorSpace:'linear',uvChannel:1,rooms:[]};
const hash=b=>createHash('sha256').update(b).digest('hex');
const ray=new T.Raycaster();ray.firstHitOnly=true;
const allPositions=[];for(const chunk of world.chunks)for(const mesh of chunk.group.children)if(mesh instanceof T.Mesh)for(const n of mesh.geometry.attributes.position.array)allPositions.push(n);
const visibility=visibilitySampler(allPositions),point=new T.Vector3(),normal=new T.Vector3();
for(const chunk of world.chunks){
 const room=ROOMS.reduce((a,b)=>Math.abs(a.z-chunk.z)<Math.abs(b.z-chunk.z)?a:b),passage=chunk.id.startsWith('passage'),width=passage?6:room.width,depth=chunk.depth,size=passage?256:1024;
 const panels=[];
 for(const side of [-1,1])for(const offset of [-.3,0,.3]){
  const position=new T.Vector3(side*(width/2-.04),4.8,chunk.z+offset*depth),normal=new T.Vector3(-side,0,0),radiance=new T.Color(0,0,0);
  for(const light of lights){const direction=light.position.clone().sub(position),d2=Math.max(.3,direction.lengthSq()),distance=Math.sqrt(d2),cos=Math.max(0,direction.normalize().dot(normal));if(cos<.001)continue;
   ray.set(position.clone().addScaledVector(normal,.04),direction);ray.far=Math.max(0,distance-.1);if(ray.intersectObject(world.architecture,false)[0])continue;
   radiance.add(light.color.clone().multiplyScalar(light.intensity*cos*.22/(4*Math.PI*d2*Math.PI)));
  }
  panels.push({position,normal,radiance,area:Math.min(18,depth*1.1)});
 }
 const irradiance=(p,n)=>{
  const c=new T.Color(.042,.047,.055).multiplyScalar(.6+.4*Math.max(0,n.y));
  for(const panel of panels){const direction=panel.position.clone().sub(p),d2=direction.lengthSq();if(d2<.04)continue;const distance=Math.sqrt(d2);direction.divideScalar(distance);const cos=Math.max(0,n.dot(direction))*Math.max(0,-panel.normal.dot(direction));if(cos<.001)continue;
   ray.set(p.clone().addScaledVector(n,.025),direction);ray.far=Math.max(0,distance-.1);if(ray.intersectObject(world.architecture,false)[0])continue;
   c.add(panel.radiance.clone().multiplyScalar(cos*panel.area/Math.max(.5,d2)));
  }
  const occlusion=visibility.sample(p,n,.85,24);return [Math.min(.85,c.r)*occlusion,Math.min(.85,c.g)*occlusion,Math.min(.85,c.b)*occlusion];
 };
 const meshes=chunk.group.children.filter(o=>o instanceof T.Mesh),doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene(chunk.id),primitives=[];
 const access=(type,data)=>doc.createAccessor().setType(type).setArray(data).setBuffer(buffer);
 let triangleCount=0;
 for(const [mi,m]of meshes.entries()){
  const g=m.geometry,material=m.material,family=material.name==='masonry'?'wall':material.name==='floor'?'floor':null;
  const mat=doc.createMaterial(`${chunk.id}-${mi}`).setBaseColorFactor([...material.color.toArray(),1]).setRoughnessFactor(material.roughness??1).setMetallicFactor(material.metalness??0).setDoubleSided(material.side===T.DoubleSide).setExtras({surfaceFamily:family});
  const prim=doc.createPrimitive().setMaterial(mat).setAttribute('POSITION',access('VEC3',new Float32Array(g.attributes.position.array))).setAttribute('NORMAL',access('VEC3',new Float32Array(g.attributes.normal.array))).setAttribute('TEXCOORD_0',access('VEC2',new Float32Array(g.attributes.uv.array)));
  if(g.attributes.color)prim.setAttribute('COLOR_0',access('VEC3',new Float32Array(g.attributes.color.array)));
  if(g.index)prim.setIndices(access('SCALAR',new Uint32Array(g.index.array)));
  weldPrimitive(prim);triangleCount+=(prim.getIndices()?.getCount()??prim.getAttribute('POSITION').getCount())/3;primitives.push(prim);
  scene.addChild(doc.createNode(`${chunk.id}-${mi}`).setMesh(doc.createMesh().addPrimitive(prim)));
 }
 const uv=unwrap(primitives,doc,buffer,size,6),pixels=Buffer.alloc(size*size*4),mask=new Uint8Array(size*size),cache=new Map();
 console.log(chunk.id,'UV charts',uv.charts,'of',triangleCount,'triangles; baking',size);
 for(const prim of primitives){
  const pos=prim.getAttribute('POSITION').getArray(),norm=prim.getAttribute('NORMAL').getArray(),samples=new Float32Array(pos.length);
  for(let i=0;i<pos.length/3;i++){
   point.fromArray(pos,i*3);normal.fromArray(norm,i*3).normalize();const key=[...point.toArray().map(v=>v.toFixed(3)),...normal.toArray().map(v=>v.toFixed(2))].join(',');
   if(!cache.has(key))cache.set(key,irradiance(point,normal));samples.set(cache.get(key),i*3);
  }
  raster(prim,'TEXCOORD_1',size,(p,ids,a,b,c)=>{for(let k=0;k<3;k++)pixels[p*4+k]=Math.round((samples[ids[0]*3+k]*a+samples[ids[1]*3+k]*b+samples[ids[2]*3+k]*c)*255);pixels[p*4+3]=255;mask[p]=1;});
 }
 const coveredPixels=mask.reduce((s,v)=>s+v,0);dilate([pixels],mask,size,6);
 const png=await sharp(pixels,{raw:{width:size,height:size,channels:4}}).png().toBuffer(),raw=await io.writeBinary(doc);
 await writeFile(`assets-source/dungeon/${chunk.id}.glb`,raw);await writeFile(`public/assets/dungeon/v9/${chunk.id}-indirect.png`,png);
 await compressRoom(doc);const glb=await io.writeBinary(doc);await writeFile(`public/assets/dungeon/v9/${chunk.id}.glb`,glb);
 report.rooms.push({id:chunk.id,z:chunk.z,depth:chunk.depth,url:`/assets/dungeon/v9/${chunk.id}.glb`,lightmap:`/assets/dungeon/v9/${chunk.id}-indirect.png`,lightmapSize:size,lightmapUvComponentType:'FLOAT32',shippedPaddingPixels:uv.padding*size/Math.max(uv.width,uv.height),triangles:triangleCount,materialDraws:meshes.length,bytes:glb.length,sha256:hash(glb),lightmapBytes:png.length,lightmapSha256:hash(png),uvCharts:uv.charts,uv,coverage:coveredPixels/(size*size)});
}
visibility.dispose();
await writeFile('public/assets/dungeon/v9/manifest.json',JSON.stringify(report,null,2)+'\n');
await writeFile('assets-source/dungeon/README.md','# Dungeon masters\n\nEditable modular rooms with contiguous xatlas UV1 charts. Each room uses a 1024px linear indirect map (passages 256px), six atlas-pixel padding (over three shipped pixels) and edge dilation. UV1 remains Float32 through compression to preserve chart boundaries. Fixed-torch patch irradiance and 24-ray local visibility are baked offline. This is an approximation, not path-traced GI. Actors, gates and shrine-state lighting are excluded. Source geometry and materials are in dungeon-art.ts/world.ts.\n');

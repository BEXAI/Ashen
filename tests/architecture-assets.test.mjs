import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
const here=path.dirname(fileURLToPath(import.meta.url)),game=process.env.ASHEN_GAME||(existsSync(path.resolve(here,'../app/game/dungeon.ts'))?path.resolve(here,'..'):'/Users/nathaniel/Documents/ChatGPT/Knight/game');
const proposal=existsSync(path.join(here,'architecture-assets.ts'))?here:path.join(game,'app/game');
const kit=process.env.ARCHITECTURE_KIT||(existsSync(path.join(game,'public/assets/props/v2/architecture-kit.glb'))?path.join(game,'public/assets/props/v2'):'/tmp/ashen-architecture-kit'),require=createRequire(path.join(game,'package.json'));
const {build}=require('esbuild'),{NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),{MeshoptDecoder}=require('meshoptimizer');
const result=await build({stdin:{contents:`export * from '${proposal}/architecture-assets';export * from '${proposal}/architecture-placements';export {ROOMS,CORRIDORS,GATES} from '${game}/app/game/dungeon';export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';export * as T from 'three';`,resolveDir:game},bundle:true,write:false,format:'esm',platform:'node',nodePaths:[path.join(game,'node_modules')],logLevel:'silent',plugins:[{name:'outside-checkout-imports',setup(build){build.onResolve({filter:/^\.\/(dungeon|character-assets)$/},args=>args.importer.startsWith(proposal)?{path:path.join(game,'app/game',args.path+'.ts')}:undefined);}}]});
const {ArchitectureAssets,ARCHITECTURE_MANIFEST_URL,selectArchitectureLod,architecturePlacements,ROOMS,CORRIDORS,GATES,GLTFLoader,T}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const manifest=JSON.parse(await fs.readFile(path.join(game,'public',ARCHITECTURE_MANIFEST_URL),'utf8'));
await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const variants={};
for(const variant of ['compressed','fallback']){
 const file=path.join(kit,variant==='compressed'?'architecture-kit.glb':'architecture-kit-fallback.glb');assert.equal(createHash('sha256').update(await fs.readFile(file)).digest('hex'),manifest.assets.architecture[variant==='compressed'?'sha256':'fallback_sha256']);const doc=await io.read(file);
 for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())p.setMaterial(null);
 doc.getRoot().listMaterials().forEach(m=>m.dispose());doc.getRoot().listTextures().forEach(t=>t.dispose());
 doc.getRoot().listExtensionsUsed().filter(e=>['EXT_meshopt_compression','KHR_texture_basisu'].includes(e.extensionName)).forEach(e=>e.dispose());variants[variant]=await io.writeBinary(doc);
}
async function asset(variant='compressed'){
 const b=variants[variant],gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const disposed={geometry:0,material:0,texture:0,image:0};
 const textures=Array.from({length:3},()=>{const tex=new T.Texture({width:1,height:1,close:()=>disposed.image++});tex.addEventListener('dispose',()=>disposed.texture++);return tex;});
 const material=new T.MeshStandardMaterial({map:textures[0],normalMap:textures[1],roughnessMap:textures[2],aoMap:textures[2]});material.addEventListener('dispose',()=>disposed.material++);
 const meshes={Arch:[],Pillar:[],Trim:[]};gltf.scene.traverse(o=>{if(o instanceof T.Mesh){o.material=material;meshes[o.userData.module][o.userData.lod]=o;o.geometry.addEventListener('dispose',()=>disposed.geometry++);}});gltf.scene.updateMatrixWorld(true);
 return {gltf,disposed,meshes,material};
}
const once=d=>assert.deepEqual(d,{geometry:9,material:1,texture:3,image:3});
const matrixClose=(a,b)=>assert.ok(a.elements.every((x,i)=>Math.abs(x-b.elements[i])<2e-5));
const sceneInstances=w=>w.scene.children.filter(o=>o instanceof T.InstancedMesh);
const camera=()=>{const c=new T.PerspectiveCamera(90,1,.1,200);c.position.set(0,4,55);c.lookAt(0,4,38);return c;};
async function settled(){for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));}
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function fixture(fn,options={}){
 const fetch=globalThis.fetch,requests=[],placements=options.placements??architecturePlacements(),fallbacks=new Map(),scene=new T.Scene();
 for(const p of placements){const old=new T.Group();old.name=p.id;scene.add(old);fallbacks.set(p.id,[old]);}
 const architecture=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial());architecture.userData.bvhIdentity={};const gates=[new T.Group(),new T.Group(),new T.Group()],colliders=[{x:2,z:5,r:1}],lights=[new T.PointLight()];scene.add(architecture,...gates,...lights);const w={scene,architecture,gates,colliders,lights};
 let now=0;
 globalThis.fetch=async(url,options)=>{requests.push({url,options});assert.equal(url,ARCHITECTURE_MANIFEST_URL);return {ok:true,json:async()=>manifest};};
 const loader=new ArchitectureAssets(w,{extensions:{has:()=>false}},()=>{}, {placements,fallbacks,now:()=>now});
 try{await fn({w,loader,requests,fallbacks,placements,setNow:n=>now=n});}finally{loader.dispose();globalThis.fetch=fetch;}
}

test('placements frame all four passages, retain the three progression gates, and reuse wall footprints',()=>{
 const p=architecturePlacements();assert.equal(p.length,11);assert.deepEqual(p.filter(p=>p.module==='Arch').map(p=>p.position),[[0,0,38],[0,0,8],[0,0,-22],[0,0,-48]]);
 assert.equal(CORRIDORS.length,4);assert.deepEqual(GATES.map(g=>g.z),[5,-25,-52]);assert.ok(CORRIDORS.every(c=>c.width===6));
 for(const pillar of p.filter(p=>p.roomId==='crown'&&p.module==='Pillar')){assert.equal(Math.abs(pillar.position[0]),15.65);assert.ok([-45,-33].includes(pillar.position[2]));assert.match(pillar.replaces,/existing/);}
 for(const pillar of p.filter(p=>p.roomId==='throne'&&p.module==='Pillar')){assert.equal(pillar.position[2]+.45,-81.55);assert.equal(pillar.position[1],0);}
 const trim=p.find(p=>p.module==='Trim');assert.ok(trim.position[1]>6);assert.ok(trim.position[2]+.285<=-81.53);
});

test('both actual quantized variants preserve physical bounds and anchors at every module LOD',async()=>{
 for(const variant of ['compressed','fallback'])for(const moduleName of ['Arch','Pillar','Trim'])await fixture(async({w,loader})=>{
  const a=await asset(variant);loader.parse=async()=>a.gltf;const c=camera();c.position.set(3,4,13);c.lookAt(3,4,-7);const expectedPlacement=new T.Matrix4().compose(new T.Vector3(3,0,-7),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.4),new T.Vector3(1,1,1));
  loader.update(c,0,1000,.2,{draws:3,triangles:25000});await settled();assert.match(loader.status.state,/^ready:/);
  assert.ok(a.meshes[moduleName].some(m=>m.position.length()>.01||m.scale.distanceTo(new T.Vector3(1,1,1))>.01),'actual quantization node transform required');
  const heights={Arch:8.88,Pillar:5.2,Trim:.35};
  for(const [targetPixels,lod]of [[500,0],[120,1],[20,2]]){
   const worldBounds=new T.Box3();a.meshes[moduleName].forEach(m=>worldBounds.union(new T.Box3().setFromObject(m)));worldBounds.applyMatrix4(expectedPlacement);const distance=worldBounds.getCenter(new T.Vector3()).distanceTo(c.position),height=targetPixels*distance*2*Math.tan(T.MathUtils.degToRad(c.fov/2))/heights[moduleName];
   loader.update(c,0,height,.2,{draws:3,triangles:25000});assert.equal(loader.status.lods[moduleName],lod);assert.equal(loader.status.draws,1);assert.equal(loader.status.instances,1);
   const source=a.meshes[moduleName][lod],batch=sceneInstances(w).find(b=>b.geometry===source.geometry),matrix=new T.Matrix4(),expected=expectedPlacement.clone().multiply(source.matrixWorld);batch.getMatrixAt(0,matrix);matrixClose(matrix,expected);
   const box=new T.Box3(),sourceBox=new T.Box3(),p=batch.geometry.attributes.position;for(let i=0;i<p.count;i++){box.expandByPoint(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix));sourceBox.expandByPoint(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(expected));}assert.ok(box.min.distanceTo(sourceBox.min)<2e-5&&box.max.distanceTo(sourceBox.max)<2e-5);
   const placement=matrix.clone().multiply(source.matrixWorld.clone().invert());const ground=a.gltf.scene.getObjectByProperty('name',moduleName+'_Ground_Runtime');assert.ok(ground);assert.ok(ground.getWorldPosition(new T.Vector3()).applyMatrix4(placement).distanceTo(new T.Vector3(3,0,-7))<1e-4);
  }
 },{placements:[{id:'test',module:moduleName,roomId:'entry',position:[3,0,-7],yaw:.4}]});
});

test('nine allocated batches share one material/atlas and never alter BVH, gates, lights, or colliders',async()=>fixture(async({w,loader,fallbacks})=>{
 const a=await asset(),bvh=w.architecture.userData.bvhIdentity,gates=[...w.gates],colliders=structuredClone(w.colliders),light=w.lights[0];loader.parse=async()=>a.gltf;
 const c=camera();loader.update(c,49,900,.2);await settled();loader.update(c,49,900,.2);
 assert.equal(sceneInstances(w).length,9);assert.ok(sceneInstances(w).every(m=>m.material===a.material));assert.equal(loader.status.residentInstances,11);assert.ok(loader.status.draws<=3&&loader.status.triangles<=12000);
 assert.equal(w.architecture.userData.bvhIdentity,bvh);assert.deepEqual(w.gates,gates);assert.deepEqual(w.colliders,colliders);assert.equal(w.lights[0],light);assert.equal(w.scene.children.filter(o=>o instanceof T.Light).length,1);
 const old=fallbacks.get('threshold-0')[0];assert.equal(old.visible,false);loader.setEnabled(false);assert.equal(old.visible,true);assert.equal(sceneInstances(w).length,0);once(a.disposed);loader.dispose();once(a.disposed);
}));

test('bad compressed contract falls back to PNG before touching original fixtures; exact visibility is restored',async()=>fixture(async({loader,fallbacks})=>{
 const bad=await asset(),good=await asset('fallback');bad.meshes.Pillar[1].userData.lod=undefined;const calls=[];loader.parse=async(url,hash)=>{calls.push([url,hash]);return calls.length===1?bad.gltf:good.gltf;};fallbacks.get('threshold-0')[0].visible=false;
 const c=camera();loader.update(c,49,900,.2);await settled();loader.update(c,49,900,.2);assert.equal(loader.status.state,'ready: PNG fallback');once(bad.disposed);assert.deepEqual(calls,[[manifest.assets.architecture.compressed_url,manifest.assets.architecture.sha256],[manifest.assets.architecture.fallback_url,manifest.assets.architecture.fallback_sha256]]);
 loader.setEnabled(false);assert.equal(fallbacks.get('threshold-0')[0].visible,false);assert.ok([...fallbacks].filter(([id])=>id!=='threshold-0').every(([,list])=>list[0].visible));once(good.disposed);
}));

test('late non-abortable parse cannot replace a newer generation or resurrect a disposed loader',async()=>fixture(async({w,loader})=>{
 const first=await asset(),second=await asset(),late=defer();let calls=0,oldSignal;loader.parse=async(_url,_hash,signal)=>{calls++;if(calls===1){oldSignal=signal;return late.promise;}return second.gltf;};const c=camera();
 loader.update(c,49,900,.2);await settled();loader.setEnabled(false);assert.equal(oldSignal.aborted,true);loader.setEnabled(true);loader.update(c,49,900,.2);await settled();loader.update(c,49,900,.2);assert.match(loader.status.state,/^ready:/);
 late.resolve(first.gltf);await settled();once(first.disposed);assert.ok(sceneInstances(w).every(m=>m.material===second.material));assert.equal(second.disposed.geometry,0);loader.dispose();once(second.disposed);
}));

test('manifest failures retry with a cooldown instead of per-frame requests and recover without a region exit',async()=>fixture(async({loader,requests,setNow})=>{
 let attempts=0;globalThis.fetch=async()=>{attempts++;if(attempts===1)throw Error('offline');return {ok:true,json:async()=>manifest};};const a=await asset();loader.parse=async()=>a.gltf;const c=camera();
 loader.update(c,49,900,.2);await settled();assert.equal(loader.status.state,'failed');for(let i=0;i<20;i++)loader.update(c,49,900,.2);assert.equal(attempts,1);
 setNow(9999);loader.update(c,49,900,.2);assert.equal(attempts,1);setNow(10000);loader.update(c,49,900,.2);await settled();assert.match(loader.status.state,/^ready:/);assert.equal(attempts,2);
}));

test('residual budget coarsens then yields modules, keeping combined prop draw and triangle totals bounded',async()=>fixture(async({loader,fallbacks})=>{
 const a=await asset();loader.parse=async()=>a.gltf;const c=new T.PerspectiveCamera(130,1,.1,200);c.position.set(0,5,-10);c.lookAt(0,5,-80);loader.update(c,-40,4000,.2);await settled();
 for(const [draws,triangles]of [[0,0],[6,12000],[8,23000],[10,25000]]){
  loader.update(c,-40,4000,.01,{draws:10-draws,triangles:25000-triangles});assert.ok(loader.status.draws+draws<=10);assert.ok(loader.status.triangles+triangles<=25000);assert.ok(loader.status.draws<=3);
 }
 assert.equal(loader.status.instances,0);assert.equal(loader.status.draws,0);assert.ok(loader.status.budgetLimited);assert.ok([...fallbacks.values()].some(list=>list[0].visible),'visible omitted replacements retain their original fallback');
 loader.update(c,-40,4000,.01,{draws:3,triangles:25000});assert.ok(loader.status.instances>0);assert.ok(loader.status.draws<=3);
}));

test('frustum and distance bounds suppress submissions and unloading restores fallbacks',async()=>fixture(async({loader,w,fallbacks})=>{
 const a=await asset();loader.parse=async()=>a.gltf;const c=camera();loader.update(c,49,900,.2);await settled();loader.update(c,49,900,.2);assert.ok(loader.status.instances>0);
 c.lookAt(0,4,150);loader.update(c,49,900,.2);assert.equal(loader.status.instances,0);assert.equal(loader.status.draws,0);assert.ok(sceneInstances(w).every(m=>!m.visible));
 loader.update(c,200,900,.2);assert.equal(loader.status.state,'unloaded');assert.equal(sceneInstances(w).length,0);assert.ok([...fallbacks.values()].every(list=>list[0].visible));once(a.disposed);
}));

test('LOD hysteresis withstands threshold jitter and recovers from reduced demand',()=>{
 let lod=1;const trace=[319,321,319,270,261,259,79,65,63,65,79,81,300,321].map(pixels=>(lod=selectArchitectureLod(pixels,lod)));assert.deepEqual(trace,[1,0,0,0,0,1,1,1,2,2,2,1,1,0]);
});

test('SHA-256 mismatch rejects the download before any decode or scene mutation',async()=>fixture(async({loader,w})=>{
 const prior=w.scene.children.length;globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer});
 await assert.rejects(loader.parse('/assets/bad.glb','0'.repeat(64),new AbortController().signal),/hash mismatch/);assert.equal(w.scene.children.length,prior);assert.equal(sceneInstances(w).length,0);
}));

test('disposal during parsing closes a late result once without installing decoration or changing fallback',async()=>fixture(async({loader,w,fallbacks})=>{
 const a=await asset(),late=defer();let signal;loader.parse=async(_u,_h,s)=>{signal=s;return late.promise;};const c=camera();loader.update(c,49,900,.2);await settled();loader.dispose();assert.equal(signal.aborted,true);const count=w.scene.children.length;
 late.resolve(a.gltf);await settled();assert.equal(w.scene.children.length,count);assert.equal(sceneInstances(w).length,0);assert.ok([...fallbacks.values()].every(list=>list[0].visible));once(a.disposed);
}));

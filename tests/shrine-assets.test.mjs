import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {readFile} from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const game=process.env.GAME_ROOT||process.cwd(),entry=process.env.SHRINE_SOURCE||path.join(game,'app/game/shrine-assets.ts'),require=createRequire(path.join(game,'package.json')),{build}=require('esbuild'),{MeshoptDecoder}=require('meshoptimizer');await MeshoptDecoder.ready;
const built=await build({stdin:{contents:`export * from ${JSON.stringify(entry)};export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';export * as T from 'three';`,resolveDir:game},write:false,nodePaths:[path.join(game,'node_modules')],bundle:true,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'read-only-source-fallback',setup(b){b.onResolve({filter:/^\./},args=>{if(args.importer!==fs.realpathSync(entry))return;for(const ext of ['.ts','.tsx','']){const p=path.resolve(game,'app/game',args.path)+ext;if(fs.existsSync(p))return {path:p};}});}}]});
const {ShrineAssets,SHRINE_MANIFEST_URL,selectShrineLod,GLTFLoader,T}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const assetDir=process.env.SHRINE_ASSET_DIR,manifest=assetDir?{version:'props-v2',assets:{shrine:JSON.parse(await readFile(path.join(assetDir,'manifest-entry.json'),'utf8'))}}:JSON.parse(await readFile(path.join(game,'public',SHRINE_MANIFEST_URL),'utf8'));
const variantBytes={};for(const key of ['compressed_url','fallback_url']){const file=assetDir?path.join(assetDir,path.basename(manifest.assets.shrine[key])):path.join(game,'public',manifest.assets.shrine[key]),bytes=await readFile(file);assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.assets.shrine[key==='compressed_url'?'sha256':'fallback_sha256']);variantBytes[key]=bytes;}
function headless(bytes){const size=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+size)),bin=bytes.subarray(28+size);delete j.images;delete j.textures;delete j.samplers;for(const m of j.materials){delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}}for(const key of ['extensionsRequired','extensionsUsed'])j[key]=(j[key]??[]).filter(n=>n!=='KHR_texture_basisu');const json=Buffer.from(JSON.stringify(j)),pad=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(pad);const out=Buffer.alloc(28+pad.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(pad.length,12);out.writeUInt32LE(0x4e4f534a,16);pad.copy(out,20);out.writeUInt32LE(bin.length,20+pad.length);out.writeUInt32LE(0x004e4942,24+pad.length);bin.copy(out,28+pad.length);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);}
async function asset(key='compressed_url'){
 const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(headless(variantBytes[key]),''),counts={geometry:0,material:0,texture:0,image:0},materials=new Set(),meshes=[];
 const texture=new T.Texture({width:1,height:1,close(){counts.image++;}});texture.addEventListener('dispose',()=>counts.texture++);
 gltf.scene.traverse(o=>{if(o instanceof T.Mesh){meshes.push(o);o.geometry.addEventListener('dispose',()=>counts.geometry++);materials.add(o.material);}});
 for(const m of materials){m.addEventListener('dispose',()=>counts.material++);if(m.userData.surface_role==='ember')m.emissiveMap=texture;else m.map=texture;}
 gltf.scene.updateMatrixWorld(true);return {gltf,counts,materials,meshes,texture};
}
function world(){const scene=new T.Scene(),shrines=[],borrowed={material:0,geometry:0,flame:0,light:0},material=new T.MeshStandardMaterial({color:'#777'});material.addEventListener('dispose',()=>borrowed.material++);
 for(const[id,x,z]of [['cinder',11,12],['dusk',-13,-16],['crown',11,-42]]){const group=new T.Group();group.position.set(x,0,z);group.rotation.y=id==='cinder'?.37:0;group.userData.checkpoint=id;scene.add(group);for(let i=0;i<3;i++){const geometry=new T.BoxGeometry(1,.2,1);geometry.addEventListener('dispose',()=>borrowed.geometry++);const m=new T.Mesh(geometry,material);m.position.y=i*.4;group.add(m);if(i===2&&id==='dusk')m.visible=false;}const light=new T.PointLight('#d08239',28);light.position.y=2.2;light.addEventListener('dispose',()=>borrowed.light++);const flame=new T.Mesh(new T.PlaneGeometry(.66,1.1),new T.MeshBasicMaterial({color:'#d08239'}));flame.position.y=1.9;flame.userData.baseScale=1;flame.geometry.addEventListener('dispose',()=>borrowed.flame++);group.add(light,flame);shrines.push({id,group,light,flame});}scene.updateMatrixWorld(true);return {scene,shrines,borrowed};}
const camera=new T.PerspectiveCamera(55,1,.1,100);camera.position.set(11,3,16);
const tick=(loader,x=11,z=12,height=720)=>loader.update(camera,x,z,height,.2);
const mounts=w=>w.shrines.map(s=>s.group.children.find(o=>o.userData.shrineId===s.id)).filter(Boolean);
const meshes=root=>{const a=[];root.traverse(o=>{if(o instanceof T.Mesh)a.push(o);});return a;};
const ember=root=>meshes(root).find(m=>m.userData.surface_role==='ember').material;
const body=root=>meshes(root).find(m=>m.userData.surface_role==='body').material;
const statusDisposals=c=>assert.deepEqual(c,{geometry:6,material:2,texture:1,image:1});
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
async function fixture(fn){const original=globalThis.fetch,requests=[];globalThis.fetch=async(url,options)=>{requests.push({url,options});assert.equal(url,SHRINE_MANIFEST_URL);return {ok:true,json:async()=>manifest};};const w=world(),before=w.shrines.map(s=>({position:s.group.position.clone(),rotation:s.group.quaternion.clone(),id:s.id,children:s.group.children.slice(),visible:s.group.children.map(o=>o.visible),flame:s.flame.matrixWorld.clone(),light:s.light.matrixWorld.clone(),flameColor:s.flame.material.color.clone(),lightColor:s.light.color.clone()}));const loader=new ShrineAssets(w,{extensions:{has:()=>false}},()=>{},['dusk']);try{await fn({w,loader,requests,before});}finally{loader.dispose();globalThis.fetch=original;}}
function originalUntouched(w,before){w.scene.updateMatrixWorld(true);w.shrines.forEach((s,i)=>{assert.ok(s.group.position.equals(before[i].position));assert.deepEqual(s.group.quaternion.toArray(),before[i].rotation.toArray());assert.equal(s.id,before[i].id);assert.equal(s.group.userData.checkpoint,s.id);assert.deepEqual(s.flame.matrixWorld.elements,before[i].flame.elements);assert.deepEqual(s.light.matrixWorld.elements,before[i].light.elements);assert.ok(s.flame.material.color.equals(before[i].flameColor));assert.ok(s.light.color.equals(before[i].lightColor));assert.equal(s.flame.visible,true);assert.equal(s.light.visible,true);});assert.deepEqual(w.borrowed,{material:0,geometry:0,flame:0,light:0});}

test('actual quantized variants retain ground/effect anchors, physical matrices and two meshes at every LOD',async()=>{
 for(const key of ['compressed_url','fallback_url'])await fixture(async({w,loader,before})=>{const a=await asset(key);loader.parse=async()=>a.gltf;tick(loader);await flush();tick(loader);assert.match(loader.status.state,/^ready:/);assert.equal(loader.status.sourceProject,manifest.assets.shrine.source_project_id);assert.equal(loader.status.sourceRevision,1);assert.equal(loader.status.instances,3);assert.equal(loader.status.visibleInstances,1);assert.equal(loader.status.draws,2);
  assert.ok(a.meshes.some(m=>Math.abs(m.scale.x-1)>.1),'Actual dequantization transforms must be exercised');
  for(const root of mounts(w)){const shrine=w.shrines.find(s=>s.id===root.userData.shrineId);root.updateMatrixWorld(true);for(const[name,target]of [['Ground',shrine.group],['FlameOrigin',shrine.flame],['LightOrigin',shrine.light]]){assert.ok(root.getObjectByName(name).getWorldPosition(new T.Vector3()).distanceTo(target.getWorldPosition(new T.Vector3()))<1e-5);}
   for(const src of a.meshes){const dst=root.getObjectByName(src.name),expected=new T.Matrix4().multiplyMatrices(shrine.group.matrixWorld,src.matrixWorld);assert.equal(dst.geometry,src.geometry);for(let i=0;i<16;i++)assert.ok(Math.abs(dst.matrixWorld.elements[i]-expected.elements[i])<1e-9,'Dequantization matrix changed');}}
  for(const[distance,lod]of [[7,0],[12,1],[25,2]]){camera.position.set(11,0,12+distance);tick(loader);assert.equal(loader.status.visibleLods[lod],1);const root=mounts(w)[0],visible=[];root.traverse(o=>{if(Number.isInteger(o.userData.lod)&&o.visible)visible.push(o);});assert.equal(visible.length,1);assert.equal(meshes(visible[0]).length,2);assert.equal(loader.status.triangles,[5936,2944,1134][lod]);}
  originalUntouched(w,before);for(const[s,i]of w.shrines.map((s,i)=>[s,i]))for(const child of before[i].children)if(child instanceof T.Mesh&&child!==s.flame)assert.equal(child.visible,mounts(w).find(m=>m.userData.shrineId===s.id).visible?false:before[i].visible[before[i].children.indexOf(child)]);
 });
});

test('body resources are shared; exactly one independently stateful ember material is cloned per shrine',async()=>fixture(async({w,loader,before})=>{
 const a=await asset();loader.parse=async()=>a.gltf;tick(loader);await flush();tick(loader);const roots=mounts(w),bodies=roots.map(body),embers=roots.map(ember);assert.ok(bodies.every(m=>m===bodies[0]));assert.equal(new Set(embers).size,3);assert.ok(embers.every(m=>m.emissiveMap===a.texture));for(const root of roots)assert.equal(new Set(meshes(root).filter(m=>m.userData.surface_role==='ember').map(m=>m.material)).size,1);
 const beforeBody=bodies[0].color.clone(),beforeOff=embers[0].color.clone();assert.equal(embers[1].emissive.getHexString(),'8cd6ec');loader.setState('cinder','lit');assert.equal(embers[0].emissive.getHexString(),'8cd6ec');assert.equal(embers[2].emissive.getHexString(),'d08239');loader.setState('cinder','off');assert.equal(embers[0].emissiveIntensity,0);assert.ok(embers[0].color.equals(beforeOff));assert.ok(bodies[0].color.equals(beforeBody));assert.equal(embers[1].emissiveIntensity,.8);originalUntouched(w,before);
}));

test('asset loading is lazy and room visibility limits normal play to one imported shrine',async()=>fixture(async({w,loader,requests})=>{
 assert.equal(requests.length,0);camera.position.set(0,4,51);tick(loader,0,51);await flush();assert.equal(requests.length,0);const a=await asset();let parses=0;loader.parse=async()=>{parses++;return a.gltf;};camera.position.set(11,3,16);tick(loader);await flush();tick(loader);assert.equal(parses,1);assert.equal(requests.length,1);assert.deepEqual(mounts(w).filter(m=>m.visible).map(m=>m.userData.shrineId),['cinder']);camera.position.set(-13,3,-12);tick(loader,-13,-16);assert.equal(parses,1);assert.deepEqual(mounts(w).filter(m=>m.visible).map(m=>m.userData.shrineId),['dusk']);assert.equal(loader.status.draws,2);
}));

test('compressed failure selects the recorded fallback and release disposes only owned resources once',async()=>fixture(async({w,loader,before})=>{
 const a=await asset('fallback_url'),calls=[];loader.parse=async(url,hash)=>{calls.push([url,hash]);if(calls.length===1)throw Error('Decoder unavailable');return a.gltf;};tick(loader);await flush();tick(loader);assert.equal(loader.status.state,'ready: PNG fallback');assert.deepEqual(calls,[[manifest.assets.shrine.compressed_url,manifest.assets.shrine.sha256],[manifest.assets.shrine.fallback_url,manifest.assets.shrine.fallback_sha256]]);let clonedDisposals=0;mounts(w).map(ember).forEach(m=>m.addEventListener('dispose',()=>clonedDisposals++));loader.setEnabled(false);assert.equal(clonedDisposals,3);assert.equal(mounts(w).length,0);statusDisposals(a.counts);originalUntouched(w,before);w.shrines.forEach((s,i)=>before[i].children.forEach((o,j)=>assert.equal(o.visible,before[i].visible[j])));loader.dispose();statusDisposals(a.counts);assert.equal(clonedDisposals,3);
}));

test('both failures keep original geometry and avoid retrying every frame, then retry after return',async()=>fixture(async({w,loader,before})=>{
 let count=0;loader.parse=async()=>{count++;throw Error('Offline');};camera.position.set(11,3,16);tick(loader);await flush();assert.equal(count,2);assert.equal(loader.status.state,'failed');assert.equal(mounts(w).length,0);for(let i=0;i<10;i++)tick(loader);await flush();assert.equal(count,2);w.shrines.forEach((s,i)=>before[i].children.forEach((o,j)=>assert.equal(o.visible,before[i].visible[j])));
 tick(loader,0,100);const a=await asset();loader.parse=async()=>{count++;return a.gltf;};tick(loader);await flush();tick(loader);assert.equal(count,3);assert.match(loader.status.state,/^ready:/);
}));

test('stale non-abortable parse cannot replace a newer successful generation',async()=>fixture(async({w,loader})=>{
 const a=await asset(),b=await asset(),late=deferred();let count=0,signal;loader.parse=async(_url,_hash,s)=>{count++;if(count===1){signal=s;return late.promise;}return b.gltf;};tick(loader);await flush();tick(loader,0,100);assert.equal(signal.aborted,true);tick(loader);await flush();tick(loader);assert.equal(mounts(w).length,3);late.resolve(a.gltf);await flush();statusDisposals(a.counts);assert.deepEqual(b.counts,{geometry:0,material:0,texture:0,image:0});assert.ok(meshes(mounts(w)[0]).some(m=>m.geometry===b.meshes[0].geometry));
}));

test('dispose during parse closes the late result without hiding fallback or changing world effects',async()=>fixture(async({w,loader,before})=>{
 const a=await asset(),late=deferred();let signal;loader.parse=async(_url,_hash,s)=>{signal=s;return late.promise;};tick(loader);await flush();loader.dispose();assert.equal(signal.aborted,true);late.resolve(a.gltf);await flush();assert.equal(mounts(w).length,0);statusDisposals(a.counts);originalUntouched(w,before);w.shrines.forEach((s,i)=>before[i].children.forEach((o,j)=>assert.equal(o.visible,before[i].visible[j])));assert.equal(loader.status.state,'disposed');
}));

test('disposed manifest continuation cannot start an asset parse',async()=>fixture(async({loader})=>{
 const late=deferred();globalThis.fetch=async()=>({ok:true,json:()=>late.promise});let parsed=0;loader.parse=async()=>{parsed++;throw Error('Must not parse');};tick(loader);await flush();loader.dispose();late.resolve(manifest);await flush();assert.equal(parsed,0);
}));

test('malformed LOD and wrong source bindings are rejected before replacing world geometry',async()=>fixture(async({w,loader,before})=>{
 const first=await asset(),second=await asset();first.gltf.scene.getObjectByName('EmberShrine_LOD1').userData.lod=undefined;second.gltf.scene.getObjectByName('EmberShrine_Runtime').userData.source_revision=99;let count=0;loader.parse=async()=>++count===1?first.gltf:second.gltf;tick(loader);await flush();assert.equal(loader.status.state,'failed');assert.equal(mounts(w).length,0);statusDisposals(first.counts);statusDisposals(second.counts);originalUntouched(w,before);
}));

test('embedded lights and duplicate LOD markers are never mounted',async()=>fixture(async({w,loader})=>{
 const first=await asset(),second=await asset();first.gltf.scene.add(new T.PointLight());second.gltf.scene.getObjectByName('EmberShrine_LOD2_body').userData.lod=2;let count=0;loader.parse=async()=>++count===1?first.gltf:second.gltf;tick(loader);await flush();assert.equal(loader.status.state,'failed');assert.equal(mounts(w).length,0);assert.equal(w.shrines.length,3);
}));

test('download hash rejection happens before GLB decoding',async()=>fixture(async({loader})=>{
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer});await assert.rejects(loader.parse('/assets/props/v2/invalid.glb','0'.repeat(64),new AbortController().signal),/hash mismatch/);
}));

test('LOD hysteresis caps LOD0 around nine metres and prevents jitter at either boundary',()=>{
 let lod=1;const near=[9,8.6,8.4,8.7,9.4,9.6].map(d=>lod=selectShrineLod(d,1000,lod));assert.deepEqual(near,[1,1,0,0,0,1]);assert.equal(selectShrineLod(30,10000,0),2);lod=1;const far=[20,20.9,21.1,20,18.1,17.9].map(d=>lod=selectShrineLod(d,100,lod));assert.deepEqual(far,[1,1,2,2,2,1]);
});


test('import budget coarsens actual geometry, limits simultaneous shrines and restores static landmarks when culled',async()=>fixture(async({w,loader,before})=>{
 const a=await asset();loader.parse=async()=>a.gltf;camera.position.set(11,3,16);tick(loader);await flush();tick(loader);
 loader.setBudget(2,3000);tick(loader);assert.deepEqual(loader.status.visibleLods,[0,1,0]);assert.equal(loader.status.triangles,2944);
 loader.setBudget(2,1200);tick(loader);assert.deepEqual(loader.status.visibleLods,[0,0,1]);assert.equal(loader.status.triangles,1134);
 const cinder=w.shrines[0],isFallback=o=>o instanceof T.Mesh&&o!==cinder.flame&&before[0].children.includes(o);
 loader.setBudget(2,1133);tick(loader);assert.equal(loader.status.visibleInstances,0);assert.equal(loader.status.triangles,0);for(const o of cinder.group.children.filter(isFallback))assert.equal(o.visible,true);
 loader.setBudget(1,5936);tick(loader);assert.equal(loader.status.draws,0);assert.equal(cinder.flame.visible,true);assert.equal(cinder.light.visible,true);
 loader.setBudget(2,5936);tick(loader);assert.equal(loader.status.draws,2);assert.equal(loader.status.triangles,5936);for(const o of cinder.group.children.filter(isFallback))assert.equal(o.visible,false);
 for(const shrine of w.shrines)shrine.group.position.set(11,0,12);w.scene.updateMatrixWorld(true);tick(loader);assert.equal(loader.status.visibleInstances,1);assert.equal(loader.status.draws,2);
 loader.setBudget(6,17808);tick(loader);assert.equal(loader.status.visibleInstances,3);assert.equal(loader.status.draws,6);assert.equal(loader.status.triangles,17808);
 loader.setBudget(4,11872);tick(loader);assert.equal(loader.status.visibleInstances,2);assert.equal(loader.status.draws,4);assert.equal(loader.status.triangles,11872);const hidden=mounts(w).find(r=>!r.visible),shrine=w.shrines.find(s=>s.id===hidden.userData.shrineId),index=w.shrines.indexOf(shrine);for(const o of before[index].children)if(o instanceof T.Mesh&&o!==shrine.flame)assert.equal(o.visible,before[index].visible[before[index].children.indexOf(o)]);
}));

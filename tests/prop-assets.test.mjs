// The asynchronous parse boundary is replaced only for deterministic lifecycle cases.
// Actual exported quantized geometry and anchors remain intact.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd(),require=createRequire(resolve(root,'package.json'));
const {build}=require('esbuild'),{NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),{MeshoptDecoder}=require('meshoptimizer');
const result=await build({stdin:{contents:'export * from "./app/game/prop-assets";export {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";export * as T from "three";',resolveDir:root},write:false,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {PropAssets,PROP_MANIFEST_URL,selectPropLod,GLTFLoader,T}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const manifest=JSON.parse(await readFile(resolve(root,'public/assets/props/v2/manifest.json'),'utf8'));
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const variants={};
for(const key of ['compressed_url','fallback_url']){
 const doc=await io.read(resolve(root,'public'+manifest.assets.sconce[key]));
 // Preserve quantized coordinates, node matrices and anchors; omit image decoding in Node.
 for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())p.setMaterial(null);
 doc.getRoot().listMaterials().forEach(m=>m.dispose());doc.getRoot().listTextures().forEach(t=>t.dispose());
 doc.getRoot().listExtensionsUsed().filter(e=>['EXT_meshopt_compression','KHR_texture_basisu'].includes(e.extensionName)).forEach(e=>e.dispose());
 variants[key]=await io.writeBinary(doc);
}
async function asset(key='compressed_url'){
 const b=variants[key],gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const counts={geometry:0,material:0,texture:0,image:0};
 const image={width:1,height:1,close:()=>counts.image++},texture=new T.Texture(image),material=new T.MeshStandardMaterial({map:texture});
 texture.addEventListener('dispose',()=>counts.texture++);material.addEventListener('dispose',()=>counts.material++);
 const meshes=[];gltf.scene.traverse(o=>{if(o instanceof T.Mesh){o.material=material;o.geometry.addEventListener('dispose',()=>counts.geometry++);meshes[o.userData.lod]=o;}});gltf.scene.updateMatrixWorld(true);
 return {gltf,counts,meshes,material};
}
function world(){
 const scene=new T.Scene(),fixtures=[],lights=[];const stone=new T.MeshStandardMaterial({vertexColors:true});let stoneDisposals=0;stone.addEventListener('dispose',()=>stoneDisposals++);
 for(const [roomId,halfWidth,z]of [['entry',10,49],['cinder',16,20],['dusk',19,-10],['crown',16,-38],['throne',19,-69]])for(const side of [-1,1]){
  const fallback=new T.Group(),flame=new T.Object3D(),light=new T.PointLight(0xffaa66,28);flame.position.set(side*(halfWidth-1),3.4,z);light.position.set(flame.position.x,3.7,z);scene.add(fallback,flame,light);fixtures.push({roomId,side,wallX:side*halfWidth,z,fallback,flame});lights.push(light);
 }
 scene.updateMatrixWorld(true);return {scene,fixtures,surfaces:[{family:'wall',material:stone,repeat:1}],lights,get stoneDisposals(){return stoneDisposals;}};
}
const camera=new T.PerspectiveCamera(120,1,.1,160);camera.position.set(0,3.4,55);camera.lookAt(0,3.4,49);
const tick=(loader,z=49,height=4000)=>loader.update(camera,z,height,.2);
async function settled(){for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function fixture(fn,rooms=['entry']){
 const originalFetch=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,options)=>{requests.push({url,options});assert.equal(url,PROP_MANIFEST_URL);return {ok:true,json:async()=>manifest};};
 const w=world(),loader=new PropAssets(w,{extensions:{has:()=>false}},()=>{},rooms);
 try{await fn({w,loader,requests});}finally{loader.dispose();globalThis.fetch=originalFetch;}
}
const instances=w=>w.scene.children.filter(o=>o instanceof T.InstancedMesh);
const close=(a,b,message,eps=2e-5)=>assert.ok(Math.abs(a-b)<eps,`${message}: ${a} vs ${b}`);
const disposedExactlyOnce=counts=>assert.deepEqual(counts,{geometry:3,material:1,texture:1,image:1});

test('exported quantized sconce preserves physical size and both effect anchors on both fixture sides at every LOD',async()=>{
 for(const key of ['compressed_url','fallback_url'])await fixture(async({w,loader})=>{
  const loaded=await asset(key),originalEffects=w.fixtures.map(f=>f.flame.matrixWorld.clone()),lightPositions=w.lights.map(l=>l.position.clone());loader.parse=async()=>loaded.gltf;
  tick(loader);await settled();assert.match(loader.status.state,/^ready:/);
  assert.ok(loaded.meshes.some(m=>Math.abs(m.scale.x-1)>.1),'Fixture must exercise actual dequantization node transforms');
  const sourceBounds=loaded.meshes.map(m=>new T.Box3().setFromObject(m).getSize(new T.Vector3()));
  for(const [height,lod]of [[4000,0],[1600,1],[100,2]]){
   tick(loader,49,height);assert.equal(loader.status.visibleLods[lod],2);assert.equal(loader.status.instances,2);
   const batch=instances(w).find(m=>m.geometry===loaded.meshes[lod].geometry);assert.equal(batch.count,2);
   for(let instance=0;instance<2;instance++){
    const f=w.fixtures[instance],matrix=new T.Matrix4();batch.getMatrixAt(instance,matrix);
    // The mount contract independently fixes these coordinates. Undo source-mesh
    // dequantization to recover placement, then check anchors in world metres.
    const placement=matrix.clone().multiply(loaded.meshes[lod].matrixWorld.clone().invert());
    for(const [anchor,expected]of [['FlameOrigin',f.flame.position],['LightOrigin',w.lights[instance].position]]){
     const point=loaded.gltf.scene.getObjectByName(anchor).getWorldPosition(new T.Vector3()).applyMatrix4(placement);assert.ok(point.distanceTo(expected)<2e-5,`${key} LOD${lod} ${anchor} side${f.side}`);
    }
    const mount=loaded.gltf.scene.getObjectByName('Mount').getWorldPosition(new T.Vector3()).applyMatrix4(placement);close(mount.x,f.side*9.265,'mount x');close(mount.y,3.015,'mount y');close(mount.z,49,'mount z');
    const bounds=new T.Box3(),p=batch.geometry.attributes.position;for(let i=0;i<p.count;i++)bounds.expandByPoint(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix));const size=bounds.getSize(new T.Vector3()),expected=sourceBounds[lod];close(size.x,expected.z,'rotated width');close(size.y,expected.y,'height');close(size.z,expected.x,'rotated depth');assert.ok(size.y>1&&size.y<1.2,'Export must stay about 1.1m high');
   }
  }
  assert.ok(w.fixtures.slice(0,2).every(f=>!f.fallback.visible));assert.ok(w.fixtures.slice(2).every(f=>f.fallback.visible),'Pilot must not replace cinder fixtures');
  for(const f of w.fixtures.slice(0,2))close(f.flame.userData.flameFloor,3.38,'Installed flame floor');assert.ok(w.fixtures.slice(2).every(f=>!('flameFloor' in f.flame.userData)),'Non-pilot flames must be untouched');
  w.scene.updateMatrixWorld(true);w.fixtures.forEach((f,i)=>assert.deepEqual(f.flame.matrixWorld.elements,originalEffects[i].elements));w.lights.forEach((l,i)=>assert.ok(l.position.equals(lightPositions[i])));assert.equal(w.scene.children.filter(o=>o instanceof T.Light).length,10);
 });
});

test('compressed decode failure uses the manifest PNG fallback and releases only owned resources',async()=>fixture(async({w,loader})=>{
 w.fixtures[2].flame.userData.flameFloor=1.25;
 const loaded=await asset('fallback_url'),calls=[];loader.parse=async(url,hash)=>{calls.push([url,hash]);if(calls.length===1)throw Error('Decoder failed');return loaded.gltf;};
 tick(loader);await settled();tick(loader);assert.equal(loader.status.state,'ready: PNG fallback');assert.deepEqual(calls,[[manifest.assets.sconce.compressed_url,manifest.assets.sconce.sha256],[manifest.assets.sconce.fallback_url,manifest.assets.sconce.fallback_sha256]]);
 const corbel=instances(w).find(m=>m.material===w.surfaces[0].material);let corbelDisposed=0;corbel.geometry.addEventListener('dispose',()=>corbelDisposed++);
 loader.setEnabled(false);assert.equal(loader.status.instances,0);assert.equal(instances(w).length,0);assert.ok(w.fixtures.every(f=>f.fallback.visible));disposedExactlyOnce(loaded.counts);assert.equal(corbelDisposed,1);assert.equal(w.stoneDisposals,0,'Borrowed stone material must survive release');assert.ok(w.fixtures.slice(0,2).every(f=>!('flameFloor' in f.flame.userData)),'Releasing prop must restore original flame cropping');assert.equal(w.fixtures[2].flame.userData.flameFloor,1.25,'Unowned flame data must survive release');loader.dispose();disposedExactlyOnce(loaded.counts);
}));

test('both load failures preserve fallback, avoid per-frame retries, and retry after returning to entry',async()=>fixture(async({w,loader})=>{
 let calls=0;loader.parse=async()=>{calls++;throw Error('Offline');};tick(loader);await settled();assert.equal(loader.status.state,'failed');assert.equal(calls,2);assert.ok(w.fixtures.every(f=>f.fallback.visible));assert.equal(instances(w).length,0);
 for(let i=0;i<8;i++)tick(loader);await settled();assert.equal(calls,2);
 const good=await asset();loader.parse=async()=>{calls++;return good.gltf;};tick(loader,0);tick(loader);await settled();tick(loader);assert.match(loader.status.state,/^ready:/);assert.equal(calls,3);
}));

test('leaving while a non-abortable parse runs cannot install its stale result over a newer load',async()=>fixture(async({w,loader})=>{
 const first=await asset(),second=await asset(),late=deferred();let calls=0,oldSignal;loader.parse=async(_url,_hash,signal)=>{calls++;if(calls===1){oldSignal=signal;return late.promise;}return second.gltf;};
 tick(loader);await settled();assert.equal(loader.status.state,'loading');tick(loader,-20);assert.equal(oldSignal.aborted,true);assert.equal(loader.status.state,'unloaded');assert.ok(w.fixtures.every(f=>f.fallback.visible));tick(loader);await settled();tick(loader);assert.match(loader.status.state,/^ready:/);
 late.resolve(first.gltf);await settled();tick(loader);disposedExactlyOnce(first.counts);assert.deepEqual(second.counts,{geometry:0,material:0,texture:0,image:0});assert.equal(loader.status.instances,2);assert.ok(instances(w).some(m=>m.geometry===second.meshes[0].geometry));
}));

test('disposal during parsing prevents scene mutations and closes late decoded resources once',async()=>fixture(async({w,loader})=>{
 const loaded=await asset(),late=deferred();let signal;loader.parse=async(_url,_hash,s)=>{signal=s;return late.promise;};tick(loader);await settled();loader.dispose();assert.equal(signal.aborted,true);const childCount=w.scene.children.length;late.resolve(loaded.gltf);await settled();tick(loader);assert.equal(w.scene.children.length,childCount);assert.equal(instances(w).length,0);assert.ok(w.fixtures.every(f=>f.fallback.visible));assert.ok(w.fixtures.every(f=>!('flameFloor' in f.flame.userData)),'A late disposed load must not install flame cropping');disposedExactlyOnce(loaded.counts);
}));

test('missing middle LOD is rejected before fallback fixtures are hidden',async()=>fixture(async({w,loader})=>{
 const loaded=await asset();loaded.meshes[1].userData.lod=undefined;loader.parse=async()=>loaded.gltf;tick(loader);await settled();assert.equal(loader.status.state,'failed');assert.equal(instances(w).length,0);assert.ok(w.fixtures.every(f=>f.fallback.visible));disposedExactlyOnce(loaded.counts);assert.doesNotThrow(()=>tick(loader));
}));

test('LOD hysteresis resists pixel jitter in both travel directions and returns to full detail',()=>{
 let lod=1;const trace=[94,96,94,80,76,74,39,29,27,29,39,41,90,96].map(pixels=>(lod=selectPropLod(pixels,lod)));assert.deepEqual(trace,[1,0,0,0,0,1,1,1,2,2,2,1,1,0]);
});


test('full rollout shares ten mounts and submits only nearby visible fixtures while preserving effect ownership',async()=>fixture(async({w,loader})=>{
 const loaded=await asset(),original=w.fixtures.map(f=>f.flame.position.clone());let parses=0;loader.parse=async()=>{parses++;return loaded.gltf;};w.fixtures[8].flame.userData.flameFloor=1.25;
 tick(loader);await settled();tick(loader);
 assert.equal(loader.status.residentInstances,10);assert.ok(loader.status.instances>0&&loader.status.instances<=4);assert.ok(w.fixtures.every(f=>!f.fallback.visible));assert.equal(instances(w).length,4);
 const pointCamera=new T.PerspectiveCamera(100,1,.1,160);pointCamera.position.set(0,3.4,-51);pointCamera.lookAt(0,3.4,-69);
 loader.update(pointCamera,-69,2400,.2);assert.equal(loader.status.residentInstances,10);assert.equal(loader.status.instances,2);assert.equal(parses,1,'Walking through chambers must reuse the decoded template');
 assert.equal(instances(w).find(m=>m.name==='Stone torch mounting corbels').count,2);
 pointCamera.lookAt(0,3.4,-50);loader.update(pointCamera,-69,2400,.2);assert.ok(loader.status.instances<=4,'Only frustum-visible nearby instances submit matrices');
 pointCamera.position.set(0,3.4,200);pointCamera.lookAt(0,3.4,250);loader.update(pointCamera,49,2400,.2);assert.equal(loader.status.instances,0);assert.equal(loader.status.draws,0);assert.ok(instances(w).every(m=>!m.visible&&m.count===0));
 w.fixtures.forEach((f,i)=>assert.ok(f.flame.position.equals(original[i])));
 loader.setEnabled(false);assert.ok(w.fixtures.every(f=>f.fallback.visible));assert.equal(w.fixtures[8].flame.userData.flameFloor,1.25);assert.ok(w.fixtures.filter((_,i)=>i!==8).every(f=>!Object.hasOwn(f.flame.userData,'flameFloor')));assert.equal(w.stoneDisposals,0);disposedExactlyOnce(loaded.counts);
},null));

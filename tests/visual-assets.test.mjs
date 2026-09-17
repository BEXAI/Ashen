import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import validator from 'gltf-validator';
import sharp from 'sharp';
await mkdir('.sites-runtime/tests',{recursive:true});
const output=process.cwd()+'/.sites-runtime/tests/visual-assets.mjs';
await build({stdin:{contents:'export * from "./app/game/character-assets";export * from "./app/game/combat-animation";export * from "./app/game/combat";export {knight} from "./app/game/character-skins";export {SurfaceTextures,runtimeSurfaceAsset} from "./app/game/graphics";export {ImpactPool} from "./app/game/effects";export {DungeonAssets,DUNGEON_MANIFEST_URL} from "./app/game/dungeon-assets";export {createWorld} from "./app/game/world";export {newProgress} from "./app/game/model";export {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";export {MeshoptDecoder} from "three/addons/libs/meshopt_decoder.module.js";export * as T from "three";',resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {T,GLTFLoader,MeshoptDecoder,knight,installActorVisual,applyStrikePose,bladeSegment,STRIKES,strikeDuration,bladeHitsCapsule,selectActorLod,supportedAssetTier,retimeStrike,SurfaceTextures,runtimeSurfaceAsset,ImpactPool,CharacterAssets,DungeonAssets,DUNGEON_MANIFEST_URL,createWorld,newProgress}=await import(pathToFileURL(output));
const manifest=JSON.parse(await readFile('public/assets/characters/v9/manifest.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
function geometryOnly(bytes){
 const j=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),offset=20+bytes.readUInt32LE(12),bin=bytes.subarray(offset+8);
 delete j.materials;delete j.textures;delete j.images;delete j.samplers;
 for(const m of j.meshes)for(const p of m.primitives)delete p.material;
 j.extensionsRequired=(j.extensionsRequired??[]).filter(x=>x!=='KHR_texture_basisu');j.extensionsUsed=(j.extensionsUsed??[]).filter(x=>x!=='KHR_texture_basisu');
 const json=Buffer.from(JSON.stringify(j)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);const out=Buffer.alloc(12+8+padded.length+8+bin.length);
 out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);padded.copy(out,20);out.writeUInt32LE(bin.length,20+padded.length);out.writeUInt32LE(0x004e4942,24+padded.length);bin.copy(out,28+padded.length);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);
}
async function rig(id,compressed=true){const path=compressed?'public'+manifest.characters[id].variants.mobile.url:`assets-source/characters/${id}.glb`;return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(geometryOnly(await readFile(path)),'');}

test('Every runtime asset and separate fallback matches its manifest and has valid glTF structure',async()=>{
 for(const character of Object.values(manifest.characters)){
  assert.ok(character.boneCount<=64);assert.ok(character.weightsPerVertex<=4);assert.equal(character.triangles.length,3);assert.ok(character.triangles[0]>character.triangles[1]);assert.ok(character.triangles[1]>=character.triangles[2]);
  for(const variant of Object.values(character.variants))for(const fallback of [false,true]){
   const bytes=await readFile('public'+(fallback?variant.fallback:variant.url));assert.equal(hash(bytes),fallback?variant.fallbackSha256:variant.sha256);
   if(!fallback){const jsonSize=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonSize)),binaryStart=28+jsonSize;
    for(const image of json.images){const view=json.bufferViews[image.bufferView],start=binaryStart+(view.byteOffset??0),header=bytes.subarray(start,start+80);
     assert.equal(image.mimeType,'image/ktx2');assert.equal(header.readUInt32LE(12),0,'All KTX2 textures must use universal compression');assert.ok([1,2].includes(header.readUInt32LE(44)),'Expected BasisLZ or UASTC/Zstd');
     const kind=image.name.split('_').pop();assert.equal(header.readUInt32LE(20),variant.textureSizes[kind]);assert.equal(header.readUInt32LE(24),variant.textureSizes[kind]);assert.ok(header.readUInt32LE(40)>1,'Missing texture mip chain');
    }
   }
   const result=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:200});assert.equal(result.issues.numErrors,0,JSON.stringify(result.issues.messages));
  }
 }
});
test('Compressed rigs preserve all four weapon paths and independently cloned skeletons',async()=>{
 for(const [id,enemy,boss]of [['ash-knight',false,false],['crypt-warden',true,false],['ember-sovereign',true,true]]){
  const template=await rig(id),reference=knight(enemy,boss),a=knight(enemy,boss),b=knight(enemy,boss);installActorVisual(a,template);installActorVisual(b,template);
  const original=b.arms[1].quaternion.clone();let maxError=0;
  for(const s of STRIKES)for(let i=0;i<=90;i++){
   const time=i/90*strikeDuration(s);applyStrikePose(reference,s,time);applyStrikePose(a,s,time);
   const base=new T.Vector3(),tip=new T.Vector3(),rb=new T.Vector3(),rt=new T.Vector3();bladeSegment(a,base,tip);bladeSegment(reference,rb,rt);
   const error=Math.max(base.distanceTo(rb),tip.distanceTo(rt));if(error>maxError){maxError=error;if(process.env.ASHEN_TRACE_POSE&&error>.03)console.log(id,s.id,time,error,base.toArray(),rb.toArray());}
   assert.ok([base.x,base.y,base.z,tip.x,tip.y,tip.z].every(Number.isFinite));
  }
  if(process.env.ASHEN_TRACE_POSE)console.log(id,'max weapon error metres',maxError);
  assert.ok(maxError<.04,`${id}: maximum weapon deviation ${maxError}m`);assert.ok(b.arms[1].quaternion.equals(original));
  assert.notEqual(a.arms[1],b.arms[1]);a.visual.dispose();assert.ok(b.group.children.length>0);b.visual.dispose();
 }
});
test('Enemy retiming preserves active hits, planted roots and committed approach distances',async()=>{
 for(const [id,boss]of [['crypt-warden',false],['ember-sovereign',true]]){
  const a=knight(true,boss);installActorVisual(a,await rig(id));
  for(const baseStrike of STRIKES){const s={...baseStrike,windup:boss?.8:.55,active:baseStrike.active*(boss?1.2:1),recovery:baseStrike.recovery*(boss?1.15:1)};let hits=0;
   for(let i=0;i<=40;i++){const t=s.windup+i/40*s.active;applyStrikePose(a,s,t);const b=new T.Vector3(),tip=new T.Vector3();bladeSegment(a,b,tip);if(bladeHitsCapsule(b,tip,0,boss?3.65:2.1,.6,.4,2.3))hits++;}
   assert.ok(hits>0,`${id} ${s.id} must reach hero`);assert.equal(a.group.position.length(),0);assert.equal(retimeStrike(s,s.windup),baseStrike.windup);
  }
 }
});
test('LOD hysteresis holds close-combat detail and reduces far meshes',()=>{
 assert.equal(selectActorLod(4,30,2),0);assert.equal(selectActorLod(15,175,0),0);assert.equal(selectActorLod(15,175,1),1);assert.equal(selectActorLod(35,30,1),2);
});
test('Unsupported compression cannot silently allocate 4K RGBA character textures',()=>{
 assert.equal(supportedAssetTier('high',false,8192,false),'mobile');
 assert.equal(supportedAssetTier('high',false,2048,true),'hd');
 assert.equal(supportedAssetTier('high',false,8192,true),'high');
 assert.equal(supportedAssetTier('auto',true,8192,true),'mobile');
 assert.equal(supportedAssetTier('low',true,8192,true),'low');
});
test('Skinned geometry remains finite and grounded through all committed strike poses',async()=>{
 for(const [id,enemy,boss]of [['ash-knight',false,false],['crypt-warden',true,false],['ember-sovereign',true,true]]){
  const a=knight(enemy,boss);installActorVisual(a,await rig(id));
  for(const s of STRIKES)for(const time of [0,s.windup,s.windup+s.active,strikeDuration(s)]){
   applyStrikePose(a,s,time);a.group.updateMatrixWorld(true);const box=new T.Box3().makeEmpty();
   a.group.traverse(o=>{if(!(o instanceof T.SkinnedMesh)||!o.visible)return;for(let i=0;i<o.geometry.attributes.position.count;i++){const v=o.getVertexPosition(i,new T.Vector3()).applyMatrix4(o.matrixWorld);assert.ok(v.toArray().every(Number.isFinite));box.expandByPoint(v);}});
   assert.ok(box.min.y>-.7,`${id}: below-floor bound ${box.min.y}`);assert.ok(box.max.y<9&&box.getSize(new T.Vector3()).length()<15,id);
  }
 }
});
test('All chamber bakes ship matching geometry and non-overlapping continuous UV1 charts',async()=>{
 const dungeon=JSON.parse(await readFile('public/assets/dungeon/v9/manifest.json'));
 assert.equal(dungeon.rooms.length,9);
 for(const room of dungeon.rooms){const bytes=await readFile('public'+room.url);assert.equal(hash(bytes),room.sha256);assert.equal(hash(await readFile('public'+room.lightmap)),room.lightmapSha256);assert.ok(room.materialDraws<=10);
  const result=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:200});assert.equal(result.issues.numErrors,0,room.id);
  const loaded=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(geometryOnly(bytes),'');const size=room.lightmapSize,covered=new Uint8Array(size*size);let overlap=0,interior=0;
  loaded.scene.traverse(o=>{if(!(o instanceof T.Mesh))return;const uv=o.geometry.attributes.uv1,index=o.geometry.index;assert.ok(uv,room.id);
   for(let i=0;i<uv.count;i++)assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1,'UV outside atlas');
   for(let i=0;i<(index?.count??uv.count);i+=3){
    const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),x=ids.map(j=>uv.getX(j)*size),y=ids.map(j=>uv.getY(j)*size),den=(y[1]-y[2])*(x[0]-x[2])+(x[2]-x[1])*(y[0]-y[2]);if(Math.abs(den)<1e-8)continue;
    for(let py=Math.max(0,Math.floor(Math.min(...y)));py<=Math.min(size-1,Math.ceil(Math.max(...y)));py++)for(let px=Math.max(0,Math.floor(Math.min(...x)));px<=Math.min(size-1,Math.ceil(Math.max(...x)));px++){
     const a=((y[1]-y[2])*(px+.5-x[2])+(x[2]-x[1])*(py+.5-y[2]))/den,b=((y[2]-y[0])*(px+.5-x[2])+(x[0]-x[2])*(py+.5-y[2]))/den,c=1-a-b;
     if(Math.min(a,b,c)>.001){const p=py*size+px;overlap+=covered[p]?1:0;covered[p]=1;interior++;}
    }
   }
  });
  assert.equal(overlap,0,`${room.id}: overlapping UV interiors`);assert.ok(interior>size*size*.2,'Atlas lacks useful coverage');assert.ok(room.uvCharts<room.triangles*.6,'Triangle-grid bake was not replaced');assert.ok(room.uv.padding*size/Math.max(room.uv.width,room.uv.height)>3,'Insufficient shipped padding');
 }
});
test('Surface switching coalesces requests, shares maps, and disposes stale completions',async()=>{
 const pending=[],original=T.TextureLoader.prototype.load;
 T.TextureLoader.prototype.load=function(path,ok){const texture=new T.Texture();pending.push(()=>ok(texture));return texture;};
 try{
  const a=new T.MeshStandardMaterial(),b=new T.MeshStandardMaterial(),surfaces=new SurfaceTextures([{material:a,family:'floor',repeat:1},{material:b,family:'floor',repeat:1}],2,()=>assert.fail('load failed'));
  const first=surfaces.setQuality('high');await Promise.resolve();assert.equal(pending.length,3);const second=surfaces.setQuality('low');surfaces.setQuality('medium');assert.equal(pending.length,3);
  pending.splice(0).forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,3);pending.splice(0).forEach(fn=>fn());await Promise.all([first,second]);assert.equal(a.map,b.map);assert.equal(a.roughnessMap,b.roughnessMap);assert.ok(a.map);surfaces.dispose();
 }finally{T.TextureLoader.prototype.load=original;}
 assert.equal(runtimeSurfaceAsset('floor','diff','high'),'/assets/dungeon/floor-diff.webp');assert.equal(runtimeSurfaceAsset('wall','normal','high'),'/assets/dungeon/wall-normal-2k.webp');
});
test('production includes the original floor and wall maps for every runtime quality',async()=>{
 const urls=new Set();
 for(const quality of ['low','medium','high'])for(const family of ['floor','wall'])for(const kind of ['diff','normal','arm']){
  const url=runtimeSurfaceAsset(family,kind,quality);urls.add(url);
  const [source,shipped]=await Promise.all([readFile('public'+url),readFile('dist/client'+url)]);
  assert.equal(hash(shipped),hash(source),`${quality} ${family} ${kind}: published art differs`);
  assert.equal(shipped.toString('ascii',8,12),'WEBP',`${url}: not a WebP image`);
 }
 assert.equal(urls.size,13);assert.ok(urls.has('/assets/dungeon/floor-diff.webp'));
});

test('Repeated impacts reuse one bounded particle draw, fade and expire cleanly',()=>{
 const scene=new T.Scene(),pool=new ImpactPool(scene,48),geometry=pool.points.geometry;for(let i=0;i<200;i++)pool.burst(0,1,0,'#d2ad80',20,()=>.5);pool.update(.02);assert.equal(scene.children.length,1);assert.equal(pool.points.geometry,geometry);assert.equal(geometry.attributes.position.count,48);assert.ok(geometry.attributes.particleLife.getX(0)>0&&geometry.attributes.particleLife.getX(0)<1);pool.update(1);assert.equal(pool.points.visible,false);assert.equal(geometry.attributes.particleLife.getX(0),0);pool.dispose();assert.equal(scene.children.length,0);
});

test('4K masters contain actual crevice occlusion and separate material channels',async()=>{
 for(const [id,character]of Object.entries(manifest.characters)){
  const metadata=await sharp(`assets-source/characters/${id}-base.png`).metadata();assert.equal(metadata.width,4096);assert.equal(metadata.height,4096);
  assert.equal(character.tangentBasis,'MikkTSpace');assert.ok(character.uv.charts<character.triangles[0]/5);
  const {data}=await sharp(`assets-source/characters/${id}-orm.png`).resize(512,512,{kernel:'nearest'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let min=255,max=0,distinct=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>250){min=Math.min(min,data[i]);max=Math.max(max,data[i]);if(data[i]!==data[i+1]&&data[i+1]!==data[i+2])distinct++;}
  assert.ok(max-min>70,`${id}: occlusion is constant`);assert.ok(distinct>1000,`${id}: packed channels are not independent`);
 }
});

test('Tier allocation estimates match image dimensions and PNG fallbacks stay capped',async()=>{
 for(const character of Object.values(manifest.characters)){
  assert.ok(character.variants.mobile.estimatedRgba8MipMiB<10);assert.ok(character.variants.low.estimatedRgba8MipMiB<3);
  for(const variant of Object.values(character.variants)){
   const expected=Object.values(variant.textureSizes).reduce((s,n)=>s+n*n*4*4/3,0)/1048576;assert.ok(Math.abs(expected-variant.estimatedRgba8MipMiB)<.001);
   const bytes=await readFile('public'+variant.fallback),jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength));
   for(const image of json.images){const view=json.bufferViews[image.bufferView],start=28+jsonLength+(view.byteOffset??0),meta=await sharp(bytes.subarray(start,start+view.byteLength)).metadata();assert.ok(meta.width<=1024&&meta.height<=1024,'Decoder fallback exceeds the memory cap');}
  }
 }
});

test('Asset installation preserves authored normal strength and applies the reviewed reflection gain',async()=>{
 const template=await rig('ash-knight');let material;
 template.scene.traverse(o=>{if(o instanceof T.Mesh){material=o.material;material.normalScale.set(.82,.82);material.userData.environmentIntensity=.4;}});
 const actor=knight();installActorVisual(actor,template);assert.equal(material.normalScale.x,.82);assert.ok(Math.abs(material.envMapIntensity-.6)<1e-8);actor.visual.dispose();
});

test('Unchanged strike balance, controls and save boundaries retain their approved baseline',async()=>{
 const plan=JSON.parse(await readFile('docs/VISUAL_ASSETS_4K_UPDATE.json'));
 // The user-authorized PHYSICS_BATTLE_VIDEO_UPDATE_PLAN transfers these gameplay
 // files from the old visual-only SHA freeze to behavioral collision/lifecycle
 // contracts. Keep the historical hashes and all other protected files intact.
 const mechanicsOwned=new Set(['app/game/dungeon.ts','app/game/mobile-runtime.ts','app/game/TouchControls.tsx']);
 for(const [path,expected]of Object.entries(plan.scope.protected_sha256)){if(mechanicsOwned.has(path))continue;assert.equal(hash(await readFile(path)),expected,path);}
});
test('Decoder failure uses real PNG fallback rigs; tier changes coalesce and disposal releases instances',async()=>{
 const originalFetch=globalThis.fetch,originalParse=GLTFLoader.prototype.parseAsync,calls=[];let errors=0;
 globalThis.fetch=async(url)=>{calls.push(url);const bytes=await readFile('public'+url);return new Response(bytes,{headers:{'Content-Type':url.endsWith('.json')?'application/json':'application/octet-stream'}});};
 GLTFLoader.prototype.parseAsync=function(bytes,path){const b=Buffer.from(bytes),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));if(j.extensionsRequired?.includes('KHR_texture_basisu'))return Promise.reject(Error('Deliberately unavailable decoder'));return originalParse.call(this,geometryOnly(b),path);};
 const renderer={extensions:{has:()=>false}},manager=new CharacterAssets(renderer,'auto',true,()=>{},()=>errors++),a=knight(),b=knight();
 try{
  manager.register(a);manager.register(b);manager.load();await manager.queue;assert.ok(a.visual);assert.ok(b.visual);assert.equal(manager.status['ash-knight'],'ready: PNG fallback');assert.equal(manager.cache.get('ash-knight').references,2);
  const before=calls.length;manager.setQuality('low');manager.setQuality('high');manager.setQuality('low');await manager.queue;assert.equal(manager.cache.get('ash-knight').tier,'low');assert.ok(!calls.slice(before).some(url=>url.includes('-high')));
  manager.dispose();assert.equal(manager.cache.size,0);assert.equal(a.group.children.length,0);assert.equal(b.group.children.length,0);assert.equal(errors,0);
 }finally{manager.dispose();globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
});
test('Room streaming retains geometry on failure and releases loaded maps across repeated traversal',async()=>{
 const originalFetch=globalThis.fetch,originalLoad=T.TextureLoader.prototype.load;
 const active=JSON.parse(await readFile('public'+DUNGEON_MANIFEST_URL)),lightmaps=new Set(active.rooms.map(r=>r.lightmap));
 const textures=[];let failedUrl=active.rooms.find(r=>r.id==='cinder').url;
 T.TextureLoader.prototype.load=function(url,onLoad){const texture=new T.Texture();if(lightmaps.has(url)){const state={texture,disposed:0};texture.addEventListener('dispose',()=>state.disposed++);textures.push(state);}if(onLoad)setImmediate(()=>onLoad(texture));return texture;};
 globalThis.fetch=async(url)=>url===failedUrl?new Response('',{status:503}):new Response(await readFile('public'+url));
 let manager;
 try{
  const world=createWorld(newProgress(),'low'),initialSurfaces=world.surfaces.length,cinder=world.chunks.find(c=>c.id==='cinder'),fallback=[...cinder.group.children];
  manager=new DungeonAssets(world,()=>{});manager.update(49);await manager.queue;
  assert.equal(cinder.loaded,false);assert.deepEqual(cinder.group.children,fallback);assert.ok(manager.loaded.has('entry'));
  failedUrl='';
  for(const z of [-69,49,-69,49]){manager.update(z);await manager.queue;assert.ok(world.chunks.every(c=>c.group.children.length>0),'No room may disappear during streaming');}
  assert.ok(world.fixtures.every(f=>f.fallback.parent===world.chunks.find(c=>c.id===f.roomId).group),'Streaming must retain independently removable fixture groups');
  assert.ok(textures.some(t=>t.disposed===1));manager.dispose();assert.equal(manager.loaded.size,0);assert.equal(world.surfaces.length,initialSurfaces);assert.ok(world.chunks.every(c=>c.group.children.length>0));assert.ok(textures.every(t=>t.disposed===1),'Each streamed lightmap has exactly one owner');
 }finally{manager?.dispose();globalThis.fetch=originalFetch;T.TextureLoader.prototype.load=originalLoad;}
});

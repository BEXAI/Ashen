import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {build} from 'esbuild';
const root=process.cwd(),base=root+'/public/assets/roster/september-8';
await fs.mkdir('.sites-runtime/tests',{recursive:true});
const modulePath=root+'/.sites-runtime/tests/roster.mjs';
await build({stdin:{contents:'export * from "./app/game/roster-assets";export * from "./app/game/character-roster";export {knight} from "./app/game/character-skins";export * from "./app/game/combat";export * as T from "three";export {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";export {MeshoptDecoder} from "three/addons/libs/meshopt_decoder.module.js";',resolveDir:root},outfile:modulePath,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const{T,GLTFLoader,MeshoptDecoder,installRosterVisual,limitRosterTextures,RosterAssets,ROSTER_MANIFEST_URL,ROSTER,HERO_IDS,ENEMY_ROSTER,approachDistance,knight,STRIKES,bladeHitsCapsule,travelBetween}=await import(modulePath);
globalThis.self=globalThis;
const manifest=JSON.parse(await fs.readFile(root+'/public'+ROSTER_MANIFEST_URL,'utf8'));
function withoutTextures(bytes){const len=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+len)),bin=bytes.subarray(28+len);doc.materials=doc.materials.map(m=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:[.5,.5,.5,1]}}));delete doc.images;delete doc.textures;const txt=Buffer.from(JSON.stringify(doc)),j=Buffer.alloc(Math.ceil(txt.length/4)*4,32);txt.copy(j);const out=Buffer.alloc(28+j.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(j.length,12);out.writeUInt32LE(0x4e4f534a,16);j.copy(out,20);out.writeUInt32LE(bin.length,20+j.length);out.writeUInt32LE(0x004e4942,24+j.length);bin.copy(out,28+j.length);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);}
test('All 16 screenshot characters have unique source IDs, portraits, weighted playable models, and a film',async()=>{
 assert.equal(HERO_IDS.length,6);assert.equal(Object.keys(ENEMY_ROSTER).length,10);assert.equal(Object.keys(manifest.characters).length,16);assert.equal(new Set(Object.values(ROSTER).map(r=>r.sourceId)).size,16);
 for(const[id,entry]of Object.entries(ROSTER)){const model=manifest.characters[id];assert.equal(model.sourceAssetId,entry.sourceId);assert.ok((await fs.stat(`${base}/portraits/${id}.webp`)).size>1000);for(const v of Object.values(model.variants)){const bytes=await fs.readFile(root+'/public'+v.url);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),v.sha256);}}
 const sources=JSON.parse(await fs.readFile(root+'/assets-source/higgsfield/2026-09-08/source-manifest.json','utf8'));assert.equal(sources.assets.length,17);for(const source of sources.assets){const original=await fs.readFile(root+'/assets-source/higgsfield/2026-09-08/'+source.filename);assert.equal(crypto.createHash('sha256').update(original).digest('hex'),source.sha256);}
 assert.ok((await fs.stat(base+'/crown-film.mp4')).size>1000000);
});
// Stationary reach is a hero contract; enemy reach includes its actual strike travel below.
test('Decoded delivery models animate independent skeletons with finite sockets and reachable hero melee contact',async()=>{
 for(const[id,model]of Object.entries(manifest.characters)){
  const bytes=await fs.readFile(root+'/public'+model.variants.mobile.url),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(withoutTextures(bytes),'');
  assert.equal(gltf.animations.length,12,id);let joints=0;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)joints+=o.skeleton.bones.length;});assert.ok(joints>=20,id);
  const actor=knight(),other=knight();actor.group.userData.visualId=id;other.group.userData.visualId=id;
  const visual=installRosterVisual(actor,gltf,model,id),second=installRosterVisual(other,gltf,model,id);
  const a=new T.Vector3(),b=new T.Vector3(),unchanged=new T.Vector3();second.segment(a,unchanged);
  for(const strike of STRIKES){let hit=false;for(let i=0;i<=30;i++){visual.strike(strike,strike.windup+strike.active*i/30);visual.segment(a,b);assert.ok([...a.toArray(),...b.toArray()].every(Number.isFinite),id);hit ||= bladeHitsCapsule(a,b,0,2.1,.62,.35,2.4);}if(HERO_IDS.includes(id)&&ROSTER[id].style==='blade')assert.ok(hit,`${id} ${strike.id} cannot reach an enemy`);}
  second.segment(a,b);assert.ok(b.distanceTo(unchanged)<1e-6,`${id} clone shares animated skeleton`);
  for(const kind of ['hit','dodge','death']){visual.reaction(kind,.1);visual.segment(a,b);assert.ok([...a.toArray(),...b.toArray()].every(Number.isFinite));}
  visual.resetPresentation();visual.locomotion(.2,1);visual.dispose();second.dispose();assert.equal(actor.visual,undefined);assert.ok(actor.group.children.every(o=>o.visible));
 }
});

test('Every imported melee enemy can contact the player at its AI approach distance',async()=>{
 const failures=[];
 for(const id of Object.values(ENEMY_ROSTER)){if(ROSTER[id].style==='staff')continue;const model=manifest.characters[id];if(!model)continue;const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(withoutTextures(await fs.readFile(root+'/public'+model.variants.mobile.url)),'');const boss=id==='ember-dragon',distance=approachDistance(id),actor=knight(true,boss),visual=installRosterVisual(actor,gltf,model,id),a=new T.Vector3(),b=new T.Vector3();
  for(const move of STRIKES){const strike={...move,windup:boss?.8:.55,active:move.active*(boss?1.2:1),recovery:move.recovery*(boss?1.15:1)};let hit=false;for(let i=0;i<=120;i++){const time=strike.windup+strike.active*i/120;actor.group.position.z=travelBetween(strike,0,time)*(boss?1.3:1);visual.strike(strike,time);visual.segment(a,b);hit ||= bladeHitsCapsule(a,b,0,distance,.60,.4,2.3);}if(!hit)failures.push(`${id} ${strike.id} cannot hit player at ${distance}m`);}visual.dispose();
 }
 assert.deepEqual(failures,[]);
});

test('An obsolete HD failure cannot block the requested mobile tier',async()=>{
 const original=globalThis.fetch,calls=[];let rejectHD;const hd=new Promise((_,reject)=>{rejectHD=reject;});
 const fixture={version:'test',characters:{'lion-knight':{height:2.65,yaw:0,contactPhase:[.3,.5],variants:{hd:{url:'/hd.glb'},mobile:{url:'/mobile.glb'}}}}};
 globalThis.fetch=async url=>{calls.push(url);if(url.endsWith('manifest.json'))return{ok:true,json:async()=>fixture};if(url==='/hd.glb')return hd;return{ok:false,status:404};};
 const assets=new RosterAssets('high',false,()=>{},()=>{});try{assets.register(knight(),'lion-knight',true);assets.update(new T.Vector3());await new Promise(setImmediate);assert.ok(calls.includes('/hd.glb'));assets.setQuality('low',false);rejectHD(new Error('old request failed'));for(let i=0;i<4;i++)await new Promise(setImmediate);assert.ok(calls.includes('/mobile.glb'));assert.equal(assets.pendingLoads,0);}finally{assets.dispose();globalThis.fetch=original;}
});

test('Roster transitions soften pose changes while active contact remains exact and repeatable',async()=>{
 const model=manifest.characters['lion-knight'],gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(withoutTextures(await fs.readFile(root+'/public'+model.variants.mobile.url)),'');
 const actor=knight(),visual=installRosterVisual(actor,gltf,model,'lion-knight');
 const bones=[];actor.group.traverse(node=>{if(node.isBone)bones.push(node);});
 const pose=()=>bones.map(node=>node.quaternion.clone());
 const delta=(a,b)=>a.reduce((n,q,i)=>n+q.clone().normalize().angleTo(b[i].clone().normalize()),0);
 visual.beginFrame();visual.locomotion(.3,0);visual.present(1/60,0,false);const idle=pose();
 visual.beginFrame();visual.locomotion(.3,1);const pure=pose();visual.present(1/60,0,false);const blended=pose();
 assert.ok(delta(idle,pure)>.1);assert.ok(delta(idle,blended)<delta(idle,pure)*.2,'movement still snaps immediately');
 visual.beginFrame();visual.locomotion(.3,1);assert.ok(delta(pose(),pure)<1e-5,'previous displayed pose polluted pure sampling');
 for(const strike of STRIKES){
  visual.beginFrame();const time=strike.windup+strike.active*.5;visual.strike(strike,time);
  const a=new T.Vector3(),b=new T.Vector3(),beforeA=new T.Vector3(),beforeB=new T.Vector3();visual.segment(beforeA,beforeB);
  visual.present(1/30,0,false);visual.segment(a,b);assert.ok(a.distanceTo(beforeA)<1e-7&&b.distanceTo(beforeB)<1e-7,'presentation changed active contacts');
  visual.strike(strike,time);visual.segment(a,b);assert.ok(a.distanceTo(beforeA)<1e-7&&b.distanceTo(beforeB)<1e-7,'repeat sampling drifted');
 }
 visual.resetPresentation();visual.locomotion(0,0);visual.present(1/60,0,false);assert.ok(bones.every(n=>[...n.position.toArray(),...n.scale.toArray()].every(Number.isFinite)));visual.dispose();
});

test('Roster residency survives the 36m visibility boundary and releases at 52m or death',async()=>{
 const original=globalThis.fetch,model=manifest.characters['lion-knight'],bytes=withoutTextures(await fs.readFile(root+'/public'+model.variants.mobile.url)),variant={url:'/fixture.glb',sha256:crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')};let requests=0;
 globalThis.fetch=async url=>url.endsWith('manifest.json')?{ok:true,json:async()=>({version:'test',characters:{'lion-knight':{...model,variants:{mobile:variant,hd:variant}}}})}:{ok:true,arrayBuffer:async()=>{requests++;return bytes;}};
 const assets=new RosterAssets('low',true,()=>{},()=>{}),actor=knight();
 const settle=async()=>{for(let i=0;i<1000&&assets.pendingLoads;i++)await new Promise(setImmediate);assert.equal(assets.pendingLoads,0);};
 try{
  assets.register(actor,'lion-knight');assets.update(new T.Vector3());await settle();assert.equal(assets.status['lion-knight'],'ready');assert.ok(actor.visual);
  actor.group.visible=false;actor.group.position.z=37;assets.update(new T.Vector3());assert.ok(actor.visual);actor.group.position.z=50;assets.update(new T.Vector3());assert.ok(actor.visual);
  actor.group.visible=true;actor.group.position.z=35;assets.update(new T.Vector3());await settle();assert.equal(requests,1,'boundary crossing decoded the model again');
  actor.group.visible=false;actor.group.position.z=53;assets.update(new T.Vector3());assert.equal(actor.visual,undefined);
  actor.group.visible=true;actor.group.position.z=35;assets.update(new T.Vector3());await settle();assert.equal(requests,2);assert.ok(actor.visual);
  assert.deepEqual(Object.keys(assets.entries[0].loaded.gltf).sort(),['animations','scene'],'parser buffers remain retained');
  actor.group.visible=false;actor.group.position.z=37;assets.update(new T.Vector3());assets.setQuality('high',false);assert.equal(actor.visual,undefined,'quality change retained the hidden old tier');
  actor.group.visible=true;actor.group.position.z=35;assets.update(new T.Vector3());await settle();assert.ok(actor.visual);
  actor.group.visible=false;actor.group.userData.deathAge=12;assets.update(new T.Vector3());assert.equal(actor.visual,undefined);assert.equal(assets.status['lion-knight'],'dormant');
 }finally{assets.dispose();globalThis.fetch=original;}
});

test('The previous 15 Ashen imports are reachable journal media with verified display files',async()=>{
 const archive=JSON.parse(await fs.readFile(root+'/public/assets/ashen-archive/manifest.json','utf8')),ui=JSON.parse(await fs.readFile(root+'/app/game/ashen-archive.json','utf8'));
 assert.equal(archive.items.length,15);assert.equal(archive.items.filter(i=>i.type==='image').length,14);assert.equal(archive.items.filter(i=>i.type==='video').length,1);assert.equal(new Set(archive.items.map(i=>i.id)).size,15);
 assert.deepEqual(ui.items.map(i=>i.id),archive.items.map(i=>i.id));
 for(const item of archive.items){const bytes=await fs.readFile(root+'/public'+item.url);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.equal(bytes.length,item.bytes);assert.ok(item.width<=1280&&item.height<=1280);assert.equal(ui.items.find(i=>i.id===item.id).url,item.url);}
});

test('A hidden enemy finishing a download is discarded before model decoding',async()=>{
 const original=globalThis.fetch;let finish;const download=new Promise(resolve=>{finish=resolve;});let errors=0;
 globalThis.fetch=async url=>url.endsWith('manifest.json')?{ok:true,json:async()=>({version:'test',characters:{'lion-knight':{variants:{mobile:{url:'/obsolete.glb'}}}}})}:download;
 const assets=new RosterAssets('low',true,()=>{},()=>{errors++;}),actor=knight();
 try{assets.register(actor,'lion-knight');assets.update(new T.Vector3());await new Promise(setImmediate);actor.group.visible=false;actor.group.position.z=37;assets.update(new T.Vector3());const bytes=new ArrayBuffer(0);finish({ok:true,arrayBuffer:async()=>bytes});for(let i=0;i<12;i++)await new Promise(setImmediate);assert.equal(assets.pendingLoads,0);assert.equal(errors,0);assert.equal(actor.visual,undefined);assert.equal(assets.status['lion-knight'],'dormant');}finally{assets.dispose();globalThis.fetch=original;}
});

test('Performance textures shrink before upload, share their resized source and release decoded bitmaps',()=>{
 let closed=0,draws=0;const image={width:1024,height:512,close:()=>{closed++;}},texture=new T.Texture(image),other=texture.clone(),separate=new T.Texture(image),scene=new T.Group();
 scene.add(new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial({map:texture,emissiveMap:other,normalMap:separate})));
 limitRosterTextures(scene,512,()=>({width:0,height:0,getContext:()=>({drawImage:()=>{draws++;}})}));
 assert.equal(texture.image.width,512);assert.equal(texture.image.height,256);assert.equal(other.image,texture.image);assert.equal(separate.image,texture.image);assert.equal(closed,1);assert.equal(draws,1);
 assert.equal(texture.image.width*texture.image.height,1024*512/4);
});

test('Grounded attack poses meet the floor and equipped staff muzzles survive prop merging',async()=>{
 for(const id of ['lion-knight','silver-knight','skeleton-warrior','sage','frost-mage','lich']){
  const model=manifest.characters[id],gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(withoutTextures(await fs.readFile(root+'/public'+model.variants.mobile.url)),'');
  const actor=knight(),visual=installRosterVisual(actor,gltf,model,id);
  if(id.endsWith('knight')||id==='skeleton-warrior')for(const strike of STRIKES){visual.strike(strike,strike.windup+strike.active*.5);actor.group.updateMatrixWorld(true);let min=Infinity;const point=new T.Vector3();actor.group.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,point).applyMatrix4(o.matrixWorld);min=Math.min(min,point.y);}}});assert.ok(Math.abs(min)<.02,`${id} ${strike.id} floats at ${min}`);}
  else{visual.strike(STRIKES[0],STRIKES[0].windup);const point=new T.Vector3();assert.ok(visual.muzzle(point));const marker=actor.group.getObjectByName('EquippedMuzzle');assert.ok(point.distanceTo(marker.getWorldPosition(new T.Vector3()))<1e-7);const equipment=actor.group.getObjectByName('Authored '+id+' equipment');if(model.equipment==='embedded'){assert.equal(equipment,undefined,'embedded staff duplicated');const parents=[];for(let n=marker.parent;n;n=n.parent)parents.push(n.name);assert.ok(parents.includes(id==='sage'?'LeftHand':'RightHand'),`${id} muzzle attached to wrong hand`);}else{let draws=0;equipment.traverse(o=>{if(o.isMesh)draws++;});assert.equal(draws,3);}}
  visual.dispose();
 }
});

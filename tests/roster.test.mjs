import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {build} from 'esbuild';
const root=process.cwd(),base=root+'/public/assets/roster/september-8';
await fs.mkdir('.sites-runtime/tests',{recursive:true});
const modulePath=root+'/.sites-runtime/tests/roster.mjs';
await build({stdin:{contents:'export * from "./app/game/roster-assets";export * from "./app/game/character-roster";export {knight} from "./app/game/character-skins";export * from "./app/game/combat";export * as T from "three";export {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";export {MeshoptDecoder} from "three/addons/libs/meshopt_decoder.module.js";',resolveDir:root},outfile:modulePath,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const{T,GLTFLoader,MeshoptDecoder,installRosterVisual,RosterAssets,ROSTER,HERO_IDS,ENEMY_ROSTER,approachDistance,knight,STRIKES,bladeHitsCapsule,travelBetween}=await import(modulePath);
globalThis.self=globalThis;
const manifest=JSON.parse(await fs.readFile(base+'/manifest.json','utf8'));
function withoutTextures(bytes){const len=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+len)),bin=bytes.subarray(28+len);doc.materials=doc.materials.map(m=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:[.5,.5,.5,1]}}));delete doc.images;delete doc.textures;const txt=Buffer.from(JSON.stringify(doc)),j=Buffer.alloc(Math.ceil(txt.length/4)*4,32);txt.copy(j);const out=Buffer.alloc(28+j.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(j.length,12);out.writeUInt32LE(0x4e4f534a,16);j.copy(out,20);out.writeUInt32LE(bin.length,20+j.length);out.writeUInt32LE(0x004e4942,24+j.length);bin.copy(out,28+j.length);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);}
test('All 16 screenshot characters have unique source IDs, portraits, weighted playable models, and a film',async()=>{
 assert.equal(HERO_IDS.length,6);assert.equal(Object.keys(ENEMY_ROSTER).length,10);assert.equal(Object.keys(manifest.characters).length,16);assert.equal(new Set(Object.values(ROSTER).map(r=>r.sourceId)).size,16);
 for(const[id,entry]of Object.entries(ROSTER)){const model=manifest.characters[id];assert.equal(model.sourceAssetId,entry.sourceId);assert.ok((await fs.stat(`${base}/portraits/${id}.webp`)).size>1000);for(const v of Object.values(model.variants)){const bytes=await fs.readFile(root+'/public'+v.url);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),v.sha256);}}
 const sources=JSON.parse(await fs.readFile(root+'/assets-source/higgsfield/2026-09-08/source-manifest.json','utf8'));assert.equal(sources.assets.length,17);for(const source of sources.assets){const original=await fs.readFile(root+'/assets-source/higgsfield/2026-09-08/'+source.filename);assert.equal(crypto.createHash('sha256').update(original).digest('hex'),source.sha256);}
 assert.ok((await fs.stat(base+'/crown-film.mp4')).size>1000000);
});
test('Decoded delivery models animate independent skeletons with finite sockets and reachable melee contact',async()=>{
 for(const[id,model]of Object.entries(manifest.characters)){
  const bytes=await fs.readFile(root+'/public'+model.variants.mobile.url),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(withoutTextures(bytes),'');
  assert.equal(gltf.animations.length,12,id);let joints=0;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)joints+=o.skeleton.bones.length;});assert.ok(joints>=20,id);
  const actor=knight(),other=knight();actor.group.userData.visualId=id;other.group.userData.visualId=id;
  const visual=installRosterVisual(actor,gltf,model,id),second=installRosterVisual(other,gltf,model,id);
  const a=new T.Vector3(),b=new T.Vector3(),unchanged=new T.Vector3();second.segment(a,unchanged);
  for(const strike of STRIKES){let hit=false;for(let i=0;i<=30;i++){visual.strike(strike,strike.windup+strike.active*i/30);visual.segment(a,b);assert.ok([...a.toArray(),...b.toArray()].every(Number.isFinite),id);hit ||= bladeHitsCapsule(a,b,0,2.1,.62,.35,2.4);}if(['lion-knight','silver-knight','dusk-rogue','knife-rogue','skeleton-warrior'].includes(id))assert.ok(hit,`${id} ${strike.id} cannot reach an enemy`);}
  second.segment(a,b);assert.ok(b.distanceTo(unchanged)<1e-6,`${id} clone shares animated skeleton`);
  for(const kind of ['hit','dodge','death']){visual.reaction(kind,.1);visual.segment(a,b);assert.ok([...a.toArray(),...b.toArray()].every(Number.isFinite));}
  visual.resetPresentation();visual.locomotion(.2,1);visual.dispose();second.dispose();assert.equal(actor.visual,undefined);assert.ok(actor.group.children.every(o=>o.visible));
 }
});

test('Every imported melee enemy can contact the player at its AI approach distance',async()=>{
 for(const id of Object.values(ENEMY_ROSTER)){if(ROSTER[id].style==='staff')continue;const model=manifest.characters[id];if(!model)continue;const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(withoutTextures(await fs.readFile(root+'/public'+model.variants.mobile.url)),'');const boss=id==='ember-dragon',distance=approachDistance(id),actor=knight(true,boss),visual=installRosterVisual(actor,gltf,model,id),a=new T.Vector3(),b=new T.Vector3();
  for(const move of STRIKES){const strike={...move,windup:boss?.8:.55,active:move.active*(boss?1.2:1),recovery:move.recovery*(boss?1.15:1)};let hit=false;for(let i=0;i<=120;i++){const time=strike.windup+strike.active*i/120;actor.group.position.z=travelBetween(strike,0,time)*(boss?1.3:1);visual.strike(strike,time);visual.segment(a,b);hit ||= bladeHitsCapsule(a,b,0,distance,.60,.4,2.3);}assert.ok(hit,`${id} ${strike.id} cannot hit player at ${distance}m`);}visual.dispose();
 }
});

test('An obsolete HD failure cannot block the requested mobile tier',async()=>{
 const original=globalThis.fetch,calls=[];let rejectHD;const hd=new Promise((_,reject)=>{rejectHD=reject;});
 const fixture={version:'test',characters:{'lion-knight':{height:2.65,yaw:0,contactPhase:[.3,.5],variants:{hd:{url:'/hd.glb'},mobile:{url:'/mobile.glb'}}}}};
 globalThis.fetch=async url=>{calls.push(url);if(url.endsWith('manifest.json'))return{ok:true,json:async()=>fixture};if(url==='/hd.glb')return hd;return{ok:false,status:404};};
 const assets=new RosterAssets('high',false,()=>{},()=>{});try{assets.register(knight(),'lion-knight',true);assets.update(new T.Vector3());await new Promise(setImmediate);assert.ok(calls.includes('/hd.glb'));assets.setQuality('low',false);rejectHD(new Error('old request failed'));for(let i=0;i<4;i++)await new Promise(setImmediate);assert.ok(calls.includes('/mobile.glb'));assert.equal(assets.pendingLoads,0);}finally{assets.dispose();globalThis.fetch=original;}
});

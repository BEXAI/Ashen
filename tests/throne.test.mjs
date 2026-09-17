import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {verifyRuntimePropBudget} from '../scripts/verify-environment.mjs';
const root=process.cwd(),file=root+'/.sites-runtime/tests/throne.mjs';
await build({stdin:{contents:'export * from "./app/game/throne-assets";export * from "./app/game/dungeon";export {newProgress} from "./app/game/model";export * as T from "three";',resolveDir:root},outfile:file,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {ThroneAssets,THRONE_MANIFEST_URL,BONE_THRONE,dungeonMove,walkable,newProgress,T}=await import(file);
const manifest=JSON.parse(await fs.readFile(root+'/public'+THRONE_MANIFEST_URL,'utf8'));
const tick=()=>new Promise(setImmediate),settle=async assets=>{for(let i=0;i<1000&&assets.status.state==='loading';i++)await tick();assert.notEqual(assets.status.state,'loading');};
test('Bone Throne has checked source identity and matching render/collision placement',async()=>{
 const asset=manifest.assets.boneThrone;assert.equal(asset.source_project_id,'02765069-6a15-4d44-852b-025f53032fdf');assert.equal(asset.source_revision,1);
 for(const[url,sha,bytes]of [[asset.compressed_url,asset.sha256,asset.download_bytes],[asset.fallback_url,asset.fallback_sha256,asset.fallback_bytes]]){const content=await fs.readFile(root+'/public'+url);assert.equal(content.length,bytes);assert.equal(createHash('sha256').update(content).digest('hex'),sha);}
 assert.deepEqual(manifest.placement.position,[BONE_THRONE.x,0,BONE_THRONE.z]);assert.equal(manifest.placement.scale,BONE_THRONE.scale);
 assert.ok(BONE_THRONE.halfWidth>=manifest.assets.boneThrone.bounds[0][0]*BONE_THRONE.scale/2);assert.ok(BONE_THRONE.halfDepth>=manifest.assets.boneThrone.bounds[0][2]*BONE_THRONE.scale/2);
});
test('Players and enemies cannot enter or tunnel through the relic and can slide past it',()=>{
 const p=newProgress();p.won=true;assert.equal(walkable(-11,-77),false);
 assert.deepEqual(dungeonMove(-13,-77,-9,-77,p),{x:-13,z:-77});assert.deepEqual(dungeonMove(-11,-75,-11,-79,p),{x:-11,z:-75});
 assert.deepEqual(dungeonMove(-12.5,-77,-12,-76.5,p),{x:-12.5,z:-76.5});assert.deepEqual(dungeonMove(0,-75,0,-80,p),{x:0,z:-80});
});
test('Throne streams once, uses verified fallback, fits the prop budget and releases distant GPU resources',async()=>{
 const previous=globalThis.fetch,calls=[];globalThis.fetch=async url=>{calls.push(url);if(url===THRONE_MANIFEST_URL)return{ok:true,json:async()=>manifest};if(url.endsWith('/bone-throne.glb'))return{ok:false};const b=await fs.readFile(root+'/public'+url);return{ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
 const scene=new T.Scene(),assets=new ThroneAssets(scene,()=>{}),camera=new T.PerspectiveCamera(60,1,.1,100);camera.position.set(-11,3,-69);camera.lookAt(-11,1,-77);
 try{
  assets.update(camera,0,51);await tick();assert.equal(calls.length,1);assets.update(camera,-11,-70);await settle(assets);assets.update(camera,-11,-70);
  assert.equal(assets.status.state,'ready: fallback');assert.equal(assets.status.draws,1);assert.equal(assets.status.triangles,6120);
  const mesh=scene.getObjectByName('Higgsfield Bone Throne');assert.ok(mesh);assert.deepEqual(mesh.position.toArray(),[-11,0,-77]);let disposed=0;mesh.traverse(o=>{if(o.isMesh)o.geometry.addEventListener('dispose',()=>disposed++);});
  verifyRuntimePropBudget({props:{draws:2,triangles:1000},shrine:{draws:2,triangles:3000},architecture:{draws:3,triangles:4000},throne:assets.status,environmentProps:{drawsUpperBound:8,trianglesUpperBound:14120}});
  assets.update(camera,-11,-40);await tick();assert.equal(calls.length,3);assets.update(camera,0,0);assert.equal(assets.status.residentInstances,0);assert.equal(scene.children.filter(n=>n.visible).length,0);assert.equal(disposed,1);
 }finally{assets.dispose();globalThis.fetch=previous;}
});
test('Unverified fallback bytes cannot appear in the scene',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async url=>url===THRONE_MANIFEST_URL?{ok:true,json:async()=>manifest}:{ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};
 const scene=new T.Scene(),assets=new ThroneAssets(scene,()=>{});
 try{assets.update(new T.PerspectiveCamera(),-11,-70);await settle(assets);assert.equal(assets.status.state,'failed');assert.equal(scene.getObjectByName('Higgsfield Bone Throne'),undefined);assets.update(new T.PerspectiveCamera(),-11,-70);assert.ok(scene.getObjectByName('Bone Throne loading fallback'));}finally{assets.dispose();globalThis.fetch=previous;}
});
test('Failed manifests recover on a later approach and the collision fallback blocks camera and combat rays',async()=>{
 const previous=globalThis.fetch;let attempts=0;globalThis.fetch=async url=>{if(url===THRONE_MANIFEST_URL){attempts++;if(attempts<=2)throw Error('offline');return{ok:true,json:async()=>manifest};}const b=await fs.readFile(root+'/public'+url);return{ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
 const scene=new T.Scene(),assets=new ThroneAssets(scene,()=>{}),camera=new T.PerspectiveCamera(60,1,.1,100);camera.position.set(-11,3,-69);camera.lookAt(-11,1,-77);
 try{
  await tick();assets.update(camera,-11,-70);await settle(assets);assets.update(camera,-11,-70);assert.equal(assets.status.state,'failed');assert.equal(assets.status.fallback,true);assert.equal(assets.status.triangles,108);
  const ray=new T.Ray(new T.Vector3(-11,1,-74),new T.Vector3(0,0,-1));assert.ok(assets.obstruction(ray,10)>2&&assets.obstruction(ray,10)<3);assert.equal(assets.obstruction(ray,1),Infinity);ray.origin.y=4;assert.equal(assets.obstruction(ray,10),Infinity);
  assets.update(camera,0,0);assets.update(camera,-11,-70);await settle(assets);assets.update(camera,-11,-70);assert.equal(assets.status.state,'ready: compressed');assert.equal(assets.status.fallback,false);assert.equal(attempts,3);
 }finally{assets.dispose();globalThis.fetch=previous;}
});

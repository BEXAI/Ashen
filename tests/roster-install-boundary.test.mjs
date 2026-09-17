import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.env.GAME_ROOT||process.cwd();
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ashen-roster-install-'));after(()=>fs.rm(dir,{recursive:true,force:true}));
const {build}=await import(pathToFileURL(path.join(root,'node_modules/esbuild/lib/main.js')));
const out=path.join(dir,'roster.mjs');
await build({stdin:{contents:`export {RosterAssets,ROSTER_MANIFEST_URL} from './app/game/roster-assets';export {knight} from './app/game/world';export {applyStrikePose,bladeSegment} from './app/game/combat-animation';export {STRIKES,bladeHitsCapsule} from './app/game/combat';export * as T from 'three';`,resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {RosterAssets,ROSTER_MANIFEST_URL,knight,applyStrikePose,bladeSegment,STRIKES,bladeHitsCapsule,T}=await import(pathToFileURL(out));globalThis.self=globalThis;
const manifest=JSON.parse(await fs.readFile(path.join(root,'public',ROSTER_MANIFEST_URL),'utf8')),model=manifest.characters['lion-knight'];
function withoutTextures(bytes){const len=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+len)),bin=bytes.subarray(28+len);doc.materials=doc.materials.map(m=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:[.5,.5,.5,1]}}));delete doc.images;delete doc.textures;const txt=Buffer.from(JSON.stringify(doc)),j=Buffer.alloc(Math.ceil(txt.length/4)*4,32);txt.copy(j);const out=Buffer.alloc(28+j.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(j.length,12);out.writeUInt32LE(0x4e4f534a,16);j.copy(out,20);out.writeUInt32LE(bin.length,20+j.length);out.writeUInt32LE(0x004e4942,24+j.length);bin.copy(out,28+j.length);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);}
const bytes=withoutTextures(await fs.readFile(path.join(root,'public',model.variants.mobile.url))),sha256=createHash('sha256').update(Buffer.from(bytes)).digest('hex');
function fixture(){const original=globalThis.fetch,calls=[];let errors=0;const characters=Object.fromEntries(['lion-knight','silver-knight'].map(id=>[id,{...model,variants:{mobile:{url:`/${id}-mobile.glb`,sha256},hd:{url:`/${id}-hd.glb`,sha256}}}]));globalThis.fetch=async url=>url.endsWith('manifest.json')?{ok:true,json:async()=>({version:'fixture',characters})}:{ok:true,arrayBuffer:async()=>{calls.push(url);return bytes;}};const assets=new RosterAssets('medium',true,()=>{},()=>{errors++;});return {assets,calls,get errors(){return errors;},restore(){assets.dispose();globalThis.fetch=original;}};}
async function settle(assets){for(let n=0;n<1000&&assets.pendingLoads;n++)await new Promise(setImmediate);assert.equal(assets.pendingLoads,0);}
function segment(actor){const a=new T.Vector3(),b=new T.Vector3();applyStrikePose(actor,STRIKES[0],.25);bladeSegment(actor,a,b);return [a,b];}
function disposalWatch(template){const counts=new Map();template.scene.traverse(o=>{for(const resource of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])].filter(Boolean)){if(counts.has(resource))continue;counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));}});return ()=>{assert.ok(counts.size>0);for(const count of counts.values())assert.equal(count,1);};}

test('Real fallback swing sockets stay fixed across download; guarded install waits for explicit safe-tick flush without refetch',async()=>{
 const f=fixture(),actor=knight();let safe=false;
 try{f.assets.register(actor,'lion-knight',true,()=>safe);const before=segment(actor);assert.equal(bladeHitsCapsule(...before,0,2.8,.62,.35,2.4),false);f.assets.update(new T.Vector3());await settle(f.assets);assert.equal(f.assets.pendingInstalls,1);assert.equal(actor.visual,undefined);assert.deepEqual(segment(actor).map(p=>p.toArray()),before.map(p=>p.toArray()));f.assets.flushPendingInstalls();assert.equal(actor.visual,undefined);
  safe=true;f.assets.update(new T.Vector3());await settle(f.assets);assert.equal(actor.visual,undefined,'async/update paths cannot install a guarded model between simulation ticks');assert.equal(f.calls.length,1);f.assets.flushPendingInstalls();assert.ok(actor.visual);assert.equal(f.assets.pendingInstalls,0);assert.equal(f.assets.status['lion-knight'],'ready');assert.equal(bladeHitsCapsule(...segment(actor),0,2.8,.62,.35,2.4),true,'real loaded geometry differs, so the boundary guard is meaningful');f.assets.flushPendingInstalls();f.assets.update(new T.Vector3());await settle(f.assets);assert.equal(f.calls.length,1);assert.equal(f.errors,0);
 }finally{f.restore();}
});

test('Independent unguarded roster consumers retain immediate installs',async()=>{const f=fixture(),actor=knight();try{f.assets.register(actor,'lion-knight',true);f.assets.update(new T.Vector3());await settle(f.assets);assert.ok(actor.visual);assert.equal(f.assets.pendingInstalls,0);assert.equal(f.assets.status['lion-knight'],'ready');}finally{f.restore();}});

test('Guarded quality replacement preserves current visual and limits decoded overlap to one pending template',async()=>{
 const f=fixture(),hero=knight(),other=knight();let safe=true;
 try{f.assets.register(hero,'lion-knight',true,()=>safe);f.assets.update(new T.Vector3());await settle(f.assets);f.assets.flushPendingInstalls();const original=hero.visual;safe=false;f.assets.setQuality('high',false);await settle(f.assets);assert.equal(f.assets.pendingInstalls,1);assert.equal(hero.visual,original);const otherActor=other;otherActor.group.position.z=2;f.assets.register(otherActor,'silver-knight',false,()=>true);f.assets.update(new T.Vector3());await settle(f.assets);assert.equal(f.calls.length,2,'second decoded model must wait while one replacement is pending');f.assets.flushPendingInstalls();assert.equal(hero.visual,original);
  safe=true;f.assets.flushPendingInstalls();await settle(f.assets);assert.notEqual(hero.visual,original);assert.equal(f.assets.sources['lion-knight'].tier,'hd');assert.equal(f.calls.length,3);assert.equal(f.assets.pendingInstalls,1);assert.equal(other.visual,undefined);f.assets.flushPendingInstalls();assert.ok(other.visual);assert.equal(f.assets.pendingInstalls,0);assert.equal(f.errors,0);
 }finally{f.restore();}
});

test('Pending templates are disposed exactly once on tier, hero, death, hidden/distance, or owner disposal',async()=>{
 for(const cause of ['tier','hero','death','hidden','distance','dispose']){const f=fixture(),actor=knight();try{f.assets.register(actor,'lion-knight',cause==='hero',()=>false);f.assets.update(new T.Vector3());await settle(f.assets);const pending=f.assets.entries[0].pending,check=disposalWatch(pending.gltf);
  if(cause==='tier')f.assets.setQuality('high',false);else if(cause==='hero')f.assets.setHero('silver-knight');else if(cause==='death'){actor.group.userData.deathAge=0;f.assets.update(new T.Vector3());}else if(cause==='hidden'){actor.group.visible=false;f.assets.update(new T.Vector3());}else if(cause==='distance'){actor.group.position.z=53;f.assets.update(new T.Vector3());}else f.assets.dispose();
  await settle(f.assets);check();assert.equal(actor.visual,undefined);assert.notEqual(f.assets.entries[0]?.pending,pending);f.assets.dispose();check();assert.equal(f.errors,0);
 }finally{f.restore();}}
});

test('Death while a download is in flight discards bytes before decode and cannot resurrect a visual',async()=>{
 const f=fixture(),actor=knight(),fetchManifest=globalThis.fetch;let finish;const wait=new Promise(resolve=>{finish=resolve;});globalThis.fetch=async url=>url.endsWith('manifest.json')?fetchManifest(url):wait;
 try{f.assets.register(actor,'lion-knight',true,()=>true);f.assets.update(new T.Vector3());await new Promise(setImmediate);actor.group.userData.deathAge=0;finish({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});await settle(f.assets);f.assets.flushPendingInstalls();assert.equal(actor.visual,undefined);assert.equal(f.assets.pendingInstalls,0);assert.equal(f.assets.status['lion-knight'],'dormant');assert.equal(f.errors,0,'invalid bytes must never reach decoder after death');}
 finally{f.restore();}
});

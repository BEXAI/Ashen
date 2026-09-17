import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root=process.env.GAME_ROOT||process.cwd();
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ashen-roster-benchmark-'));after(()=>fs.rm(dir,{recursive:true,force:true}));
const {build}=await import(pathToFileURL(path.join(root,'node_modules/esbuild/lib/main.js')));
const out=path.join(dir,'runtime.mjs');
await build({stdin:{contents:`export {GameEngine} from './app/game/engine';export {RosterAssets,ROSTER_MANIFEST_URL} from './app/game/roster-assets';export {RenderLoop} from './app/game/mobile-runtime';export {knight} from './app/game/world';export {newProgress} from './app/game/model';export {AttackSequence,createSwing,STRIKES} from './app/game/combat';export * as T from 'three';`,resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {GameEngine,RosterAssets,ROSTER_MANIFEST_URL,RenderLoop,knight,newProgress,AttackSequence,createSwing,STRIKES,T}=await import(pathToFileURL(out));
globalThis.self=globalThis;
const manifest=JSON.parse(await fs.readFile(path.join(root,'public',ROSTER_MANIFEST_URL),'utf8')),model=manifest.characters['lion-knight'];
function withoutTextures(bytes){const len=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+len)),bin=bytes.subarray(28+len);doc.materials=doc.materials.map(m=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:[.5,.5,.5,1]}}));delete doc.images;delete doc.textures;const txt=Buffer.from(JSON.stringify(doc)),j=Buffer.alloc(Math.ceil(txt.length/4)*4,32);txt.copy(j);const out=Buffer.alloc(28+j.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(j.length,12);out.writeUInt32LE(0x4e4f534a,16);j.copy(out,20);out.writeUInt32LE(bin.length,20+j.length);out.writeUInt32LE(0x004e4942,24+j.length);bin.copy(out,28+j.length);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);}
const bytes=withoutTextures(await fs.readFile(path.join(root,'public',model.variants.mobile.url))),sha256=createHash('sha256').update(Buffer.from(bytes)).digest('hex');
async function settle(assets){for(let n=0;n<1000&&assets.pendingLoads;n++)await new Promise(setImmediate);assert.equal(assets.pendingLoads,0);}
function fakeFrames(){let serial=0;const pending=new Map();return {pending,request(cb){pending.set(++serial,cb);return serial;},cancel(id){pending.delete(id);},step(now){const work=[...pending.values()];pending.clear();for(const cb of work)cb(now);}};}

// Use production engine timing, loader and RenderLoop; omit only renderer/DOM construction.
function fixture({validation=true,second=false}={}){
 const originalFetch=globalThis.fetch,g=Object.create(GameEngine.prototype),hero=knight(),other=knight(),raf=fakeFrames(),draws=[],requests=[];
 let invalidations=0,errors=0;
 Object.assign(g,{p:newProgress(),validationMode:validation,benchmarkView:null,paused:false,disposed:false,contextLost:false,combat:new AttackSequence(),facing:0,yaw:0,attackAnim:0,castCd:0,dodgeCd:0,dodgeTime:0,stamina:100,time:0,last:0,enemies:[],effects:[],keys:new Set(),stick:{x:0,y:0},touchSprint:false,attackHeld:false,actorList:[hero],world:{scene:new T.Scene(),hero},camera:new T.PerspectiveCamera(),sound:{suspend(){}},metrics:{measurements:{reset(){}}},adaptive:{resetSamples(){}}});
 g.loop=new RenderLoop(()=>{draws.push(g.advanceFrameTime(.1));g.roster.update(hero.group.position);},raf.request,raf.cancel);
 const characters=Object.fromEntries(['lion-knight','silver-knight'].map(id=>[id,{...model,variants:{mobile:{url:`/${id}.glb`,sha256},hd:{url:`/${id}.glb`,sha256}}}]));
 globalThis.fetch=async url=>url.endsWith('manifest.json')?{ok:true,json:async()=>({version:'fixture',characters})}:{ok:true,arrayBuffer:async()=>{requests.push(url);return bytes;}};
 g.roster=new RosterAssets('medium',true,()=>{invalidations++;g.loop.invalidate();},()=>{errors++;});
 g.roster.register(hero,'lion-knight',true,()=>g.canInstallRosterVisual());
 if(second){other.group.position.set(0,0,49);g.roster.register(other,'silver-knight',false,()=>true);}
 return {g,hero,other,raf,draws,requests,get invalidations(){return invalidations;},get errors(){return errors;},dispose(){g.loop.dispose();g.roster.dispose();globalThis.fetch=originalFetch;}};
}

test('A paused static benchmark wakes on each ready template and installs the serial roster queue without simulation',async()=>{
 const f=fixture({second:true}),{g,hero,other,raf}=f;
 try{
  g.benchmark('entrance');const clock=g.mechanicsState().clock,progress=structuredClone(g.p);raf.step(1);assert.equal(raf.pending.size,0,'ordinary paused draw stops');await settle(g.roster);
  assert.equal(g.roster.pendingInstalls,1);assert.equal(f.invalidations,1,'decoded pending template emits exactly one ready wake');assert.equal(raf.pending.size,1);assert.equal(hero.visual,undefined);assert.equal(f.requests.length,1);
  raf.step(2);assert.ok(hero.visual);assert.equal(other.visual,undefined);assert.equal(g.roster.pendingInstalls,0);await settle(g.roster);
  assert.equal(g.roster.pendingInstalls,1);assert.equal(f.invalidations,3,'first install plus second template-ready wake');assert.equal(raf.pending.size,1);assert.equal(f.requests.length,2);
  raf.step(3);assert.ok(other.visual);assert.equal(g.roster.pendingInstalls,0);await settle(g.roster);raf.step(4);assert.equal(raf.pending.size,0,'completed queue returns to a stopped paused loop');
  assert.equal(clock.nextTick,1);assert.equal(clock.gameTime,0);assert.deepEqual(g.p,progress);assert.ok(f.draws.every(frame=>frame.dt===0&&frame.stopped===0));assert.equal(f.errors,0);
 }finally{f.dispose();}
});

test('Ordinary pause and validation without a benchmark view never flush ready roster templates',async()=>{
 for(const validation of [false,true]){const f=fixture({validation}),{g,hero,raf}=f;try{
  g.pause(true);raf.step(1);await settle(g.roster);assert.equal(g.roster.pendingInstalls,1);assert.equal(raf.pending.size,1);raf.step(2);
  assert.equal(hero.visual,undefined);assert.equal(g.roster.pendingInstalls,1);assert.equal(raf.pending.size,0,'ready wake draws once without creating paused work');assert.equal(g.mechanicsState().clock.nextTick,1);assert.equal(f.errors,0);
 }finally{f.dispose();}}
});

test('Freeze mid-swing preserves the installed rig; changing benchmark views cancels actions before resetting presentation',async()=>{
 const f=fixture(),{g,hero,raf}=f;try{
  g.benchmark('character');raf.step(1);await settle(g.roster);raf.step(2);await settle(g.roster);raf.step(3);const oldVisual=hero.visual;assert.ok(oldVisual);
  g.combat.swing=createSwing(STRIKES[0],0);g.combat.swing.elapsed=.25;const swing=g.combat.swing;g.pause(true);g.roster.setQuality('high',false);await settle(g.roster);assert.equal(g.roster.pendingInstalls,1);raf.step(4);
  assert.equal(hero.visual,oldVisual);assert.equal(g.combat.swing,swing);assert.equal(swing.elapsed,.25);assert.equal(g.roster.pendingInstalls,1);assert.equal(raf.pending.size,0,'a guarded Freeze does not schedule continuous paused work');
  const reset=oldVisual.resetPresentation;let resetAfterCancel=false;oldVisual.resetPresentation=()=>{resetAfterCancel=g.combat.swing===null;reset();};g.benchmark('entrance');assert.equal(resetAfterCancel,true);assert.equal(g.combat.swing,null);raf.step(5);
  assert.notEqual(hero.visual,oldVisual);assert.equal(g.roster.pendingInstalls,0);assert.equal(g.roster.sources['lion-knight'].tier,'hd');assert.equal(g.mechanicsState().clock.nextTick,1);assert.equal(f.requests.length,2);assert.equal(f.errors,0);
 }finally{f.dispose();}
});

test('A ready benchmark template does not wake a hidden/context-suspended loop; restoration installs it without catch-up',async()=>{
 const f=fixture(),{g,hero,raf}=f;try{
  g.benchmark('entrance');raf.step(1);g.loop.suspend(true);await settle(g.roster);assert.equal(g.roster.pendingInstalls,1);assert.equal(raf.pending.size,0);assert.equal(hero.visual,undefined);
  g.loop.suspend(false);assert.equal(raf.pending.size,1);raf.step(10000);assert.ok(hero.visual);assert.equal(g.mechanicsState().clock.nextTick,1);assert.equal(g.mechanicsState().clock.gameTime,0);assert.equal(f.errors,0);
 }finally{f.dispose();}
});

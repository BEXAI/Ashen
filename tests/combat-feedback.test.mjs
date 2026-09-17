import os from 'node:os';
import assert from 'node:assert/strict';import test from 'node:test';import path from 'node:path';import fs from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const game=process.env.GAME_ROOT||process.cwd(),proposal=process.env.PROPOSAL_ROOT||game;
const outputDir=path.join(os.tmpdir(),'ashen-feedback-tests');
await fs.mkdir(outputDir,{recursive:true});
const {build}=await import(pathToFileURL(path.join(game,'node_modules/esbuild/lib/main.js')));
const out=path.join(outputDir,'feedback-unit.mjs');
await build({stdin:{contents:`export * from ${JSON.stringify(path.join(proposal,'app/game/camera-feedback.ts'))};export * from ${JSON.stringify(path.join(proposal,'app/game/combat-feedback.ts'))};export {WeaponTrail} from ${JSON.stringify(path.join(proposal,'app/game/combat-animation.ts'))};export {ImpactPool} from ${JSON.stringify(path.join(proposal,'app/game/effects.ts'))};export * from ${JSON.stringify(path.join(game,'app/game/combat.ts'))};export * as T from 'three';`,resolveDir:game},nodePaths:[path.join(game,'node_modules')],bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {ImpactRotation,cameraFollowAlpha,DirectionalTelegraph,bladeContactPoint,ImpactPool,WeaponTrail,STRIKES,createSwing,T}=await import(pathToFileURL(out));

test('Directional cues reuse one 17-triangle mesh and stop exactly at the active boundary',()=>{
 const scene=new T.Scene(),cue=new DirectionalTelegraph(scene,'crypt-warden'),geometry=cue.mesh.geometry,positions=geometry.attributes.position.array;
 for(const strike of STRIKES){const swing=createSwing({...strike,windup:.55},1.2);swing.elapsed=.3;cue.update(swing,2,0,3,1,false);assert.equal(cue.mesh.visible,true);assert.equal(cue.mesh.rotation.y,1.2);assert.equal(positions,geometry.attributes.position.array);assert.equal(positions.length,153);assert.equal(swing.elapsed,.3);assert.equal(swing.hits.size,0);swing.elapsed=.55;cue.update(swing,2,0,3,1,false);assert.equal(cue.mesh.visible,false);}
 cue.reset();cue.dispose();assert.equal(scene.children.length,0);
});
test('Reduced motion uses a stable terminal arrow and side/backhand point in opposite directions',()=>{
 const scene=new T.Scene(),cue=new DirectionalTelegraph(scene,'ember-sovereign');
 const s=createSwing(STRIKES[0],0);s.elapsed=.02;cue.update(s,0,0,0,1,true);const first=Array.from(cue.mesh.geometry.attributes.position.array);s.elapsed=.13;cue.update(s,0,0,0,1,true);assert.deepEqual(Array.from(cue.mesh.geometry.attributes.position.array),first);
 // Side terminal arrow follows increasing X. Backhand terminal arrow follows decreasing X.
 assert.ok(first[144]>(first[147]+first[150])/2);
 const back=createSwing(STRIKES[2],0);back.elapsed=.05;cue.update(back,0,0,0,1,true);const p=cue.mesh.geometry.attributes.position.array;assert.ok(p[144]<(p[147]+p[150])/2);cue.dispose();
});
test('Contact point is on the clipped blade at capsule height, including degenerate segments',()=>{
 const out=new T.Vector3();bladeContactPoint({x:-2,y:1,z:.2},{x:2,y:1,z:.2},0,0,.35,2.4,out);assert.ok(out.distanceTo(new T.Vector3(0,1,.2))<1e-10);
 bladeContactPoint({x:0,y:4,z:0},{x:0,y:3,z:0},0,0,.35,2.4,out);assert.ok(out.distanceTo(new T.Vector3(0,3,0))<1e-10);
 bladeContactPoint({x:1,y:2,z:3},{x:1,y:2,z:3},0,0,1,1,out);assert.deepEqual(out.toArray(),[1,2,3]);
});
test('Rotation impulse is bounded, render-only, optional, and equal at equal times at 30/60/120 Hz',()=>{
 const positions=[];for(const fps of [30,60,120]){const impulse=new ImpactRotation(),camera=new T.PerspectiveCamera(55);camera.position.set(1,2,3);const origin=camera.position.clone(),base=new T.Quaternion().setFromEuler(new T.Euler(.4,.8,0));impulse.trigger(1,-1,true);for(let i=0;i<fps/10;i++){camera.quaternion.copy(base);impulse.apply(camera,1/fps,true);}positions.push(camera.quaternion.clone());assert.deepEqual(camera.position,origin);assert.equal(camera.fov,55);assert.ok(base.angleTo(camera.quaternion)<=T.MathUtils.degToRad(.25));camera.quaternion.copy(base);impulse.apply(camera,.3,true);assert.ok(base.angleTo(camera.quaternion)<1e-8);assert.equal(impulse.active,false);}
 assert.ok(positions[0].angleTo(positions[1])<1e-7);assert.ok(positions[1].angleTo(positions[2])<1e-7);
 const i=new ImpactRotation(),c=new T.Camera();i.trigger(1,1,false);i.apply(c,.01,true);assert.equal(i.active,false);i.trigger(1,1,true);i.apply(c,.01,false);assert.equal(i.active,false);assert.deepEqual(c.quaternion.toArray(),[0,0,0,1]);
});
test('Lifecycle reset removes camera impulse and pooled contact particles',()=>{
 const i=new ImpactRotation();i.trigger(1,1,true);i.reset();const c=new T.Camera();i.apply(c,.01,true);assert.deepEqual(c.quaternion.toArray(),[0,0,0,1]);
 const scene=new T.Scene(),pool=new ImpactPool(scene,12),buffer=pool.points.geometry.attributes.position.array;for(let n=0;n<100;n++)pool.contact(0,1,0,1,0,'#fff',6,()=>.5);pool.update(.01);assert.equal(scene.children.length,1);assert.equal(buffer,pool.points.geometry.attributes.position.array);assert.equal(buffer.length,36);pool.reset();assert.equal(pool.points.visible,false);pool.dispose();assert.equal(scene.children.length,0);
});
test('Reduced-motion contact flashes stay stationary and expire without hiding accepted impact feedback',()=>{
 const scene=new T.Scene(),pool=new ImpactPool(scene,12);pool.contact(0,1,0,1,0,'#fff',6,()=>.5,true);pool.update(.03,true);assert.equal(pool.points.visible,true);const pos=pool.points.geometry.attributes.position.array.slice(0,6);pool.update(.03,true);assert.deepEqual(pool.points.geometry.attributes.position.array.slice(0,6),pos);pool.update(.1,true);assert.equal(pool.points.visible,false);pool.dispose();
});
test('Trails reject duplicate time samples and reset across teleport or disable transitions',()=>{
 const scene=new T.Scene(),trail=new WeaponTrail(scene),a=new T.Vector3(0,1,0),b=new T.Vector3(0,2,0);trail.sample(a,b,1);trail.sample(a,b,1);assert.equal(trail.mesh.geometry.drawRange.count,0);a.x=.1;trail.sample(a,b,1.01);trail.update(1.02);assert.equal(trail.mesh.visible,true);trail.update(1.03,true);assert.equal(trail.mesh.geometry.drawRange.count,0);a.x=10;trail.sample(a,b,2);a.x=20;trail.sample(a,b,2.01);assert.equal(trail.mesh.geometry.drawRange.count,0);trail.dispose();
});
test('Proposed follow response has equal elapsed-time behavior and monotonic wall response',()=>{
 function value(fps){let v=0;for(let i=0;i<fps;i++)v+=(1-v)*cameraFollowAlpha(1/fps,true);return v;}
 assert.ok(Math.abs(value(30)-value(120))<1e-12);assert.ok(cameraFollowAlpha(.016,false,true)>cameraFollowAlpha(.016,true,false));
});

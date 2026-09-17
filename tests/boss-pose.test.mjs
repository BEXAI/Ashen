import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const game=process.env.ASHEN_GAME_ROOT??process.cwd();
const here=path.join(game,'app/game');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ashen-boss-pose-'));
const {build}=await import(pathToFileURL(game+'/node_modules/esbuild/lib/main.js'));
await build({stdin:{contents:`export * from ${JSON.stringify(here+'/boss-pose.ts')};export * from ${JSON.stringify(here+'/enemy-patterns.ts')};export * from './app/game/roster-assets';export {knight} from './app/game/character-skins';export * from './app/game/combat-animation';export * from './app/game/combat';export * as T from 'three';export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';export {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';`,resolveDir:game},nodePaths:[game+'/node_modules'],outfile:temp+'/bundle.mjs',bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const m=await import(pathToFileURL(temp+'/bundle.mjs'));globalThis.self=globalThis;const {T}=m;
const manifest=JSON.parse(fs.readFileSync(game+'/public'+m.ROSTER_MANIFEST_URL)),model=manifest.characters['ember-dragon'];
const bytes=fs.readFileSync(game+'/public'+model.variants.mobile.url),len=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+len)),bin=bytes.subarray(28+len);
// Node cannot decode browser textures. Preserve exact geometry, skins, animation and meshopt bytes.
doc.materials=doc.materials.map(x=>({name:x.name,pbrMetallicRoughness:{baseColorFactor:[.5,.5,.5,1]}}));delete doc.images;delete doc.textures;
const txt=Buffer.from(JSON.stringify(doc)),j=Buffer.alloc(Math.ceil(txt.length/4)*4,32);txt.copy(j);const out=Buffer.alloc(28+j.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(j.length,12);out.writeUInt32LE(0x4e4f534a,16);j.copy(out,20);out.writeUInt32LE(bin.length,20+j.length);out.writeUInt32LE(0x004e4942,24+j.length);bin.copy(out,28+j.length);
const gltf=await new m.GLTFLoader().setMeshoptDecoder(m.MeshoptDecoder).parseAsync(out.buffer,'');
const make=()=>{const a=m.knight(true,true);a.group.userData.visualId='ember-dragon';m.installRosterVisual(a,gltf,model,'ember-dragon');return a;};
const pos=(a,name)=>a.group.getObjectByName(name).getWorldPosition(new T.Vector3());
const transforms=a=>{const rows=[];a.group.traverse(o=>{if(o.isBone)rows.push([...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()]);});return rows.flat();};
const near=(a,b,epsilon=1e-5)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
const compare=(a,b)=>{const x=transforms(a),y=transforms(b);assert.equal(x.length,y.length);x.forEach((v,i)=>near(v,y[i],1e-5));};
const strike={id:'overhead',label:'reference',windup:.8,active:.2,recovery:.65,stamina:0,damage:1,targets:1,stagger:0,travel:.2};
const nativeTime=t=>t<.65?t/.65*.8:t<1.1?.8+(t-.65)/.45*.1:.9+(t-1.1)/.85*.75;

test('actual GLB reaches conservative corridor at committed impact without socket or bone length edits',()=>{
 const a=make(),restBase=a.group.getObjectByName('ContactBase').position.clone(),restTip=a.group.getObjectByName('ContactTip').position.clone();
 for(const yaw of [0,.7,2.1,-2.6])for(const scale of [1.8,1.2])for(const reach of [1.25,1.5,1.65]){
  a.group.position.set(8,.3,-4);a.group.rotation.y=yaw;a.group.scale.setScalar(scale);
  const t=new T.Vector3(8+Math.sin(yaw)*reach*scale/1.8,.3,-4+Math.cos(yaw)*reach*scale/1.8);
  assert.equal(m.bossGroundReachable(a,t,.3),true);const r=m.applyBossPose(a,'slam',1.1,{target:t,groundY:.3});assert.equal(r.grounded,true);assert.equal(r.reachClamped,false);near(r.tip.y,.335,1e-5);near(r.tip.x,t.x,1e-5);near(r.tip.z,t.z,1e-5);
  assert.deepEqual(a.group.getObjectByName('ContactBase').position.toArray(),restBase.toArray());assert.deepEqual(a.group.getObjectByName('ContactTip').position.toArray(),restTip.toArray());
 }
});

test('hips, feet, wings and tail keep the native pose, with finite motion through instantaneous impact',()=>{
 const a=make(),b=make();let minimum=Infinity,worst;
 for(let n=0;n<=78;n++){
  const t=n*1.95/78;m.applyBossPose(a,'slam',t,{target:new T.Vector3(0,0,1.5)});m.applyStrikePose(b,strike,nativeTime(t));
  for(const name of ['Hips','LeftFoot','RightFoot','LeftToeBase','RightToeBase'])near(pos(a,name).distanceTo(pos(b,name)),0,1e-5);
  for(const value of transforms(a))assert.ok(Number.isFinite(value));
  a.group.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++){const p=o.getVertexPosition(i,new T.Vector3()).applyMatrix4(o.matrixWorld);assert.ok(Number.isFinite(p.x+p.y+p.z));if(p.y<minimum){minimum=p.y;worst={t,index:i,p:p.toArray(),weights:[0,1,2,3].map(k=>[o.skeleton.bones[o.geometry.attributes.skinIndex.getComponent(i,k)].name,o.geometry.attributes.skinWeight.getComponent(i,k)])};}}}});
 }
 console.log('Full slam sampled mesh minimum Y:',minimum,worst);
 assert.ok(minimum>-.15,'No deep mesh/floor penetration throughout authored motion');
});

test('native sweep contacts the normal hero capsule using only the original rendered socket',()=>{
 const a=make();let hits=0;const base=new T.Vector3(),tip=new T.Vector3();
 for(let i=0;i<=40;i++){m.applyBossPose(a,'sweep',.8+i*.2/40);m.bladeSegment(a,base,tip);if(m.bladeHitsCapsule(base,tip,0,3.2,.60,.4,2.3))hits++;}
 assert.ok(hits>0);assert.equal(m.applyBossPose(a,'eruption',1.0).tip.toArray().every(Number.isFinite),true);
});

test('restoration survives repeated mixer samples, render interpolation and locomotion/reaction switches',()=>{
 const a=make(),b=make();const target=new T.Vector3(0,0,1.5);
 for(const t of [1.1,1.1,.85,.85,1.1,1.5,0,1.1]){
  a.visual.beginFrame();m.applyBossPose(a,'slam',t,{target});a.visual.present(1/60,0,false);
  m.restoreBossPose(a);a.visual.locomotion(.27,1);b.visual.locomotion(.27,1);compare(a,b);
 }
 m.applyBossPose(a,'slam',1.1,{target});m.restoreBossPose(a);a.visual.reaction('hit',.13);b.visual.reaction('hit',.13);compare(a,b);
});

test('clones, side-effect-free reach checks, and swapped tiers retain independent native state',()=>{
 const a=make(),b=make(),before=transforms(b);m.applyBossPose(a,'slam',1.1,{target:new T.Vector3(0,0,1.5)});assert.deepEqual(transforms(b),before);
 const posed=transforms(a);assert.ok(m.bossGroundReachable(a,new T.Vector3(0,0,1.5)));assert.deepEqual(transforms(a),posed);
 m.installRosterVisual(a,gltf,model,'ember-dragon');m.restoreBossPose(a);a.visual.locomotion(.37,1);b.visual.locomotion(.37,1);compare(a,b);
});

test('unsupported or unreachable points fail safely and target selection locks a physical floor point',()=>{
 const a=make();assert.equal(m.bossGroundReachable(a,new T.Vector3(0,0,3.2)),false);
 assert.equal(m.bossGroundReachable(a,new T.Vector3(0,0,1.5),.5),false);
 const target=m.bossSlamTarget(a,{x:0,z:2.5});assert.ok(target);near(target.z,1.5);
 a.group.scale.x=2;assert.equal(m.bossSlamTarget(a,{x:0,z:2.5}),null);
 const fallback=m.knight(true,true);assert.equal(m.bossGroundReachable(fallback,new T.Vector3(0,0,1.5)),true);
 assert.ok(Number.isFinite(m.applyBossPose(fallback,'slam',1.1,{target:new T.Vector3(0,0,1.5)}).error));
});

const context=(time=0)=>({gameTime:time,ownerId:'king',boss:{x:0,z:0},hero:{x:0,z:2.5},alive:true,heroAlive:true,shielded:false,encounterActive:true,hazardAvailable:true,lineOfSight:()=>true,legalFloor:()=>true,canEscape:()=>true,slamReachable:()=>true});
test('slam target hook precedes all target gates and remains immutable through the warning',()=>{
 const c=new m.BossPatternController();const sweep=c.tryStart(context());const seen=[],chosen={x:0,z:1.5};
 const slam=c.tryStart({...context(sweep.endsAt+.35),slamTarget:()=>chosen,lineOfSight:(a,b)=>(seen.push(['los',b.z]),true),legalFloor:p=>(seen.push(['floor',p.z]),true),canEscape:p=>(seen.push(['escape',p.z]),true),slamReachable:p=>(seen.push(['reach',p.z]),true)});
 assert.equal(slam.pattern.id,'slam');assert.equal(slam.target.z,1.5);chosen.z=8;assert.equal(slam.target.z,1.5);assert.equal(slam.hazard.center,slam.target);assert.deepEqual(seen.slice(-4),[['los',1.5],['floor',1.5],['reach',1.5],['escape',1.5]]);
});
test('default targeting stays compatible; rejected candidate skips slam without a hidden hazard',()=>{
 const c=new m.BossPatternController(),s=c.tryStart(context());const a=c.tryStart({...context(s.endsAt+.35),slamTarget:()=>null});assert.equal(a.pattern.id,'eruption');assert.equal(a.target.z,2.5);
 const d=new m.BossPatternController(),s2=d.tryStart(context());assert.equal(d.tryStart(context(s2.endsAt+.35)).target.z,2.5);
});

test('staged adapters typecheck against real Actor/Strike APIs',async()=>{
 const {execFileSync}=await import('node:child_process');
 fs.cpSync(game+'/app/game',temp+'/game',{recursive:true});fs.symlinkSync(game+'/node_modules',temp+'/node_modules','dir');
 for(const name of ['boss-pose.ts','enemy-patterns.ts'])fs.copyFileSync(here+'/'+name,temp+'/game/'+name);
 fs.copyFileSync(here+'/hazards.ts',temp+'/game/hazards.ts');
 execFileSync(process.execPath,[game+'/node_modules/typescript/bin/tsc','--strict','--noEmit','--skipLibCheck','--moduleResolution','bundler','--module','esnext','--target','es2022','--lib','esnext,dom',temp+'/game/boss-pose.ts',temp+'/game/enemy-patterns.ts'],{stdio:'pipe'});
});

const fallbackTransforms=a=>{const values=[];a.group.traverse(o=>values.push(...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()));return values;};
test('fallback visible blade tip reaches same corridor without altering its original collision marker or joint lengths',()=>{
 const a=m.knight(true,true),socket=new T.Vector3(0,-1.43,.015);const sourceSwordPosition=a.sword.position.clone(),sourceSwordRotation=a.sword.quaternion.clone();
 for(const yaw of [0,.7,2.1,-2.6])for(const scale of [1.8,1.2])for(const reach of [1.25,1.5,1.65]){
  a.group.position.set(8,.3,-4);a.group.rotation.y=yaw;a.group.scale.setScalar(scale);const target=new T.Vector3(8+Math.sin(yaw)*reach*scale/1.8,.3,-4+Math.cos(yaw)*reach*scale/1.8);
  const before=fallbackTransforms(a);assert.equal(m.bossGroundReachable(a,target,.3),true);assert.deepEqual(fallbackTransforms(a),before);
  const r=m.applyBossPose(a,'slam',1.1,{target,groundY:.3});assert.equal(r.grounded,true);assert.equal(r.reachClamped,false);near(r.surfacePoint.distanceTo(new T.Vector3(target.x,.335,target.z)),0,1e-5);
  near(r.tip.distanceTo(a.sword.localToWorld(socket.clone())),0,1e-5);assert.deepEqual(a.sword.position.toArray(),sourceSwordPosition.toArray());assert.deepEqual(a.sword.quaternion.toArray(),sourceSwordRotation.toArray());
  for(const i of [0,1]){near(a.arms[i].getWorldPosition(new T.Vector3()).distanceTo(a.elbows[i].getWorldPosition(new T.Vector3())),Math.hypot(.05,.43)*scale);near(a.elbows[i].getWorldPosition(new T.Vector3()).distanceTo(a.wrists[i].getWorldPosition(new T.Vector3())),Math.hypot(.005,.34,.025)*scale);}
 }
});
test('fallback full mesh stays above native foot tolerance throughout slam and keeps hips/feet unchanged',()=>{
 const a=m.knight(true,true),b=m.knight(true,true);let minimum=Infinity;
 for(let n=0;n<=78;n++){const t=n*1.95/78;m.applyBossPose(a,'slam',t,{target:new T.Vector3(0,0,1.5)});m.applyStrikePose(b,strike,nativeTime(t));b.group.updateMatrixWorld(true);
  for(const [x,y] of [[a.body,b.body],...a.legs.map((x,i)=>[x,b.legs[i]]),...a.knees.map((x,i)=>[x,b.knees[i]])]){x.matrixWorld.elements.forEach((v,i)=>near(v,y.matrixWorld.elements[i]));}
  a.group.traverse(o=>{if(o.isMesh)for(let i=0;i<o.geometry.attributes.position.count;i++){const p=new T.Vector3().fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld);assert.ok(Number.isFinite(p.x+p.y+p.z));minimum=Math.min(minimum,p.y);}});
 }
 console.log('Fallback full-mesh minimum Y:',minimum);assert.ok(minimum>-.05);
});
test('fallback restores native pose, isolates clones and safely handles roster arrival',()=>{
 const a=m.knight(true,true),b=m.knight(true,true),before=fallbackTransforms(b);m.applyBossPose(a,'slam',1.1,{target:new T.Vector3(0,0,1.5)});assert.deepEqual(fallbackTransforms(b),before);
 m.restoreBossPose(a);m.applyStrikePose(a,strike,.9);m.applyStrikePose(b,strike,.9);const av=fallbackTransforms(a),bv=fallbackTransforms(b);av.forEach((v,i)=>near(v,bv[i]));
 m.applyBossPose(a,'slam',1.1,{target:new T.Vector3(0,0,1.5)});a.group.userData.visualId='ember-dragon';m.installRosterVisual(a,gltf,model,'ember-dragon');m.restoreBossPose(a);assert.equal(m.applyBossPose(a,'slam',1.1,{target:new T.Vector3(0,0,1.5)}).grounded,true);
 assert.equal(m.bossGroundReachable(m.knight(false,false),new T.Vector3(0,0,1.5)),false);
});


test('frame-start restoration preserves the displayed slam when blending into a hit',()=>{
 const correct=make(),reversed=make(),target=new T.Vector3(0,0,1.5);
 const rotations=actor=>{const values=[];actor.group.traverse(node=>{if(node.isBone)values.push(node.quaternion.clone());});return values;};
 const change=(before,after)=>before.reduce((sum,q,i)=>sum+q.clone().normalize().angleTo(after[i].clone().normalize()),0);
 for(const actor of [correct,reversed]){
  actor.visual.beginFrame();m.applyBossPose(actor,'slam',1.1,{target});actor.visual.present(1/60,0,false);
 }
 const displayed=rotations(correct);
 // Capture the displayed overlay before restoring the pure pose for sampling.
 correct.visual.beginFrame();m.restoreBossPose(correct);
 correct.visual.reaction('hit',.01);correct.visual.present(1/60,0,false);
 // Negative control: a second begin after restoration discards that displayed pose.
 m.restoreBossPose(reversed);reversed.visual.beginFrame();
 reversed.visual.reaction('hit',.01);reversed.visual.present(1/60,0,false);
 const preserved=change(displayed,rotations(correct)),lost=change(displayed,rotations(reversed));
 assert.ok(preserved>0&&preserved<1.5,`interruption snapped from displayed slam: ${preserved} aggregate radians`);
 assert.ok(lost>preserved*4,`negative control did not expose overwritten display pose: ${lost} vs ${preserved}`);
 correct.visual.dispose();reversed.visual.dispose();
});

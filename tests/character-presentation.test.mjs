import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
await mkdir('.sites-runtime/tests',{recursive:true});
const out=process.cwd()+'/.sites-runtime/tests/character-presentation.mjs';
await build({stdin:{contents:'export * from "./app/game/character-assets";export * from "./app/game/combat";export {knight} from "./app/game/character-skins";export {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";export * as T from "three";',resolveDir:process.cwd()},outfile:out,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {T,GLTFLoader,knight,installActorVisual,STRIKES,strikeDuration}=await import(pathToFileURL(out));
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const doc=await io.read('assets-source/sovereign-v11/ember-sovereign-rigged-master.glb');
for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())p.setMaterial(null);
doc.getRoot().listMaterials().forEach(m=>m.dispose());doc.getRoot().listTextures().forEach(t=>t.dispose());
const bytes=await io.writeBinary(doc),template=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const make=()=>{const actor=knight(true,true);installActorVisual(actor,template);return actor;};
const segment=a=>{const base=new T.Vector3(),tip=new T.Vector3();a.visual.segment(base,tip);return [base,tip];};

test('presentation cannot move active weapon contacts at 20/30/60/120 FPS',()=>{
 for(const fps of [20,30,60,120])for(const strike of STRIKES){const actor=make(),dt=1/fps;
  actor.visual.beginFrame();actor.visual.locomotion(.25,.8);actor.visual.present(dt,0,false);
  for(let age=0;age<=strikeDuration(strike);age+=dt){actor.visual.beginFrame();actor.visual.locomotion(age,.8);actor.visual.strike(strike,age);const before=segment(actor);actor.visual.present(dt,0,false);const after=segment(actor);
   if(age>=strike.windup&&age<strike.windup+strike.active)for(let i=0;i<2;i++)assert.ok(before[i].distanceTo(after[i])<1e-7,`${fps}fps ${strike.id} at ${age}`);
  }actor.visual.dispose();
 }
});

test('extra nonmonotonic collision samples never advance the presentation transition',()=>{
 const a=make(),b=make(),s=STRIKES[0];
 for(const actor of [a,b]){actor.visual.beginFrame();actor.visual.locomotion(.4,.8);actor.visual.present(1/60,0,false);actor.visual.beginFrame();actor.visual.locomotion(.42,.8);}
 for(const t of [.05,.19,.03,.12,.06])a.visual.strike(s,t);
 for(const actor of [a,b]){actor.visual.strike(s,.06);actor.visual.present(1/60,0,false);}
 for(const [x,y] of [[a.body,b.body],[a.arms[1],b.arms[1]],[a.legs[0],b.legs[0]],[a.knees[1],b.knees[1]]]){assert.ok(x.position.distanceTo(y.position)<1e-8);assert.ok(x.quaternion.toArray().every((v,i)=>Math.abs(v-y.quaternion.toArray()[i])<1e-8),JSON.stringify({a:x.quaternion.toArray(),b:y.quaternion.toArray()}));}
 a.visual.dispose();b.visual.dispose();
});

test('foot correction leaves actor/root and weapon unchanged; reset removes transition history',()=>{
 const actor=make();actor.visual.beginFrame();actor.visual.locomotion(.3,.8);const root=actor.body.position.clone(),position=actor.group.position.clone(),before=segment(actor);actor.visual.present(1/60,0,true);
 assert.ok(actor.body.position.equals(root));assert.ok(actor.group.position.equals(position));const after=segment(actor);for(let i=0;i<2;i++)assert.ok(after[i].distanceTo(before[i])<1e-8);
 actor.visual.resetPresentation();actor.visual.beginFrame();actor.visual.locomotion(0,0);actor.visual.present(1/60,0,true);
 const fresh=make();fresh.visual.beginFrame();fresh.visual.locomotion(0,0);fresh.visual.present(1/60,0,true);
 assert.ok(actor.legs[0].position.distanceTo(fresh.legs[0].position)<1e-8);actor.visual.dispose();fresh.visual.dispose();
});


test('mid-windup model installation and reset preserve the sampled arm pose',()=>{
 for(const reset of [false,true]){const actor=make(),s=STRIKES[0];
  if(reset){actor.visual.beginFrame();actor.visual.locomotion(.4,.8);actor.visual.present(1/60,0,false);actor.visual.resetPresentation();}
  actor.visual.beginFrame();actor.visual.strike(s,s.windup*.3);const arm=actor.arms[1],position=arm.position.clone(),rotation=arm.quaternion.clone();
  actor.visual.present(1/60,0,false);assert.ok(arm.position.distanceTo(position)<1e-8);assert.deepEqual(arm.quaternion.toArray(),rotation.toArray());actor.visual.dispose();
 }
});

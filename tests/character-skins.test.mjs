import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile,stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
await mkdir('.sites-runtime/tests',{recursive:true});
const out=process.cwd()+'/.sites-runtime/tests/skins.mjs';
await build({stdin:{contents:'export * from "./app/game/character-skins";export {animateActor} from "./app/game/world";export * as T from "three";',resolveDir:process.cwd()},outfile:out,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {knight,animateActor,T}=await import(pathToFileURL(out).href);

test('All three skins have finite geometry, usable bounds and bounded mesh cost',()=>{
 for(const [enemy,boss,id] of [[false,false,'ash-knight'],[true,false,'crypt-warden'],[true,true,'ember-sovereign']]){
  const a=knight(enemy,boss);assert.equal(a.group.userData.skin,id);
  let meshes=0,triangles=0;a.group.traverse(o=>{if(!o.geometry)return;meshes++;const g=o.geometry;triangles+=(g.index?.count??g.attributes.position.count)/3;for(const n of ['position','normal','uv'])assert.ok([...g.attributes[n].array].every(Number.isFinite),id+' '+n);});
  assert.ok(meshes<=36);assert.ok(triangles<17000);
  const box=new T.Box3().setFromObject(a.group);assert.ok(box.min.y>-.4);assert.ok(box.max.y>(boss?4:2.5));
  assert.equal(a.legs.length,2);assert.equal(a.arms.length,2);assert.equal(a.elbows.length,2);assert.equal(a.knees.length,2);assert.equal(a.sword.parent,a.wrists[1]);assert.equal(a.wrists[1].parent,a.elbows[1]);assert.equal(a.arms[1].parent,a.torso);
 }
});
test('Walking and striking preserve independent joints and never change another actor',()=>{
 const a=knight(true),b=knight(true);animateActor(a,.17,1,.8);
 assert.notEqual(a.legs[0].rotation.x,0);assert.equal(b.legs[0].rotation.x,0);
 assert.notEqual(a.arms[1].rotation.x,b.arms[1].rotation.x);
 assert.equal(a.cape.visible,false);assert.equal(knight().cape.visible,true);
});
test('Every referenced material has shipped color and relief assets from the Higgsfield image',async()=>{
 const families=new Set();for(const a of [knight(),knight(true),knight(true,true)])a.group.traverse(o=>{if(!o.material)return;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.skinFamily)families.add(m.userData.skinFamily);});
 assert.equal(families.size,6);
 for(const f of families){assert.ok((await stat(`public/assets/skins/${f}.webp`)).size>100);const p=await readFile(`public/assets/skins/${f}-height.png`);assert.equal(p.readUInt32BE(16),512);assert.equal(p.readUInt32BE(20),512);}
 const provenance=JSON.parse(await readFile('public/assets/skins/provenance.json','utf8'));assert.equal(provenance.source_job,'a4887158-9444-42f8-9573-ce2581d8495e');
});

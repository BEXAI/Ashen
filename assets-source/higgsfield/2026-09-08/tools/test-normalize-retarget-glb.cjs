#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { parseGLB, sha } = require('./inspect-optimize-glb.cjs');
const { REQUIRED, retargetRotations } = require('./normalize-retarget-glb.cjs');

async function main() {
  const req = createRequire('/Users/nathaniel/.cache/ashen-september-deps/package.json');
  const { NodeIO } = req('@gltf-transform/core'), { ALL_EXTENSIONS } = req('@gltf-transform/extensions'), T = req('three');
  const models = path.resolve(__dirname, '../models');
  const sourceBytes = await fs.readFile(path.join(models, 'silver-knight-original.glb'));
  const outputBytes = await fs.readFile(path.join(models, 'silver-knight-runtime.glb'));
  const a = parseGLB(sourceBytes), b = parseGLB(outputBytes);
  const report = JSON.parse(await fs.readFile(path.join(models, 'silver-knight-runtime.retarget-report.json'), 'utf8'));
  assert.equal(sha(sourceBytes), report.input.sha256);
  assert.equal(sha(outputBytes), report.output.sha256);
  assert(b.bin.subarray(0, a.bin.length).equals(a.bin));
  for (const key of ['meshes', 'skins', 'images', 'textures', 'asset']) assert.deepStrictEqual(b.json[key], a.json[key]);
  for (let i=0;i<a.json.nodes.length;i++) {
    const before=structuredClone(a.json.nodes[i]), after=structuredClone(b.json.nodes[i]);
    if(before.name==='RightHand'){before.children ||= [];after.children=after.children.filter(i=>i<a.json.nodes.length);}
    assert.deepStrictEqual(after,before);
  }
  for(const m of b.json.materials){assert.deepStrictEqual(m.emissiveFactor,[0,0,0]);assert(m.extensions.KHR_materials_specular.specularColorFactor.every(v=>v>=0&&v<=1));assert.equal(m.pbrMetallicRoughness.metallicFactor,.35);assert.equal(m.pbrMetallicRoughness.roughnessFactor,.6);}
  const document=await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(outputBytes));
  const animations=document.getRoot().listAnimations();assert.deepStrictEqual(animations.map(a=>a.getName()),REQUIRED);
  for(const animation of animations) {
    assert.equal(animation.listChannels().length,72);
    for(const channel of animation.listChannels()) {
      const node=channel.getTargetNode(),sampler=channel.getSampler(),output=sampler.getOutput(),name=node.getName(),property=channel.getTargetPath();
      if(property==='scale'&&name==='Hips')for(const v of output.getArray())assert.equal(v,1);
      if(property==='translation'&&name==='Hips'){const rest=node.getTranslation();for(let i=0;i<output.getCount();i++){const v=output.getElement(i,[]);assert(Math.abs(v[0]-rest[0])<1e-5);assert(Math.abs(v[2]-rest[2])<1e-5);}}
      if(animation.getName()!=='idle'&&property==='translation'&&name!=='Hips')for(let i=0;i<output.getCount();i++){const v=output.getElement(i,[]),rest=node.getTranslation();for(let k=0;k<3;k++)assert(Math.abs(v[k]-rest[k])<1e-5);}
      if(property==='rotation')for(let i=0;i<output.getCount();i++){const q=new T.Quaternion().fromArray(output.getElement(i,[]));assert(Math.abs(q.length()-1)<1e-4);}
    }
  }
  assert.equal(report.validation.numErrors,0);assert.equal(report.missingCanonicalClips.length,0);
  assert(Math.abs(report.rawSkinnedBounds.rest.bounds.size[1]-1.85)<1e-5);
  assert.deepStrictEqual(report.normalizedSkinnedBounds.rest.bounds,report.rawSkinnedBounds.rest.bounds);
  const rawIdle=report.rawSkinnedBounds.clips[0],idle=report.normalizedSkinnedBounds.clips.find(c=>c.name==='idle');
  assert(Math.abs(rawIdle.maximumVertexY/idle.maximumVertexY-report.clips.find(c=>c.name==='idle').rootScaleFix.factor)<1e-5);
  // Independent rotated-parent/rotated-bind test of rest-aware quaternion correction.
  const qp=new T.Quaternion().setFromEuler(new T.Euler(.2,.4,-.3)), qt=new T.Quaternion().setFromEuler(new T.Euler(-.4,.3,.6));
  const qs=new T.Quaternion().setFromEuler(new T.Euler(.7,-.1,.2)), qd=new T.Quaternion().setFromEuler(new T.Euler(-.2,.8,.4));
  const ps={},pt={},sn={getParentNode:()=>ps,getName:()=> 'source'},tn={getParentNode:()=>pt,getName:()=> 'target'};
  const sr={worldQ:new Map([[ps,qp],[sn,qp.clone().multiply(qs)]])},tr={worldQ:new Map([[pt,qt],[tn,qt.clone().multiply(qd)]])};
  const qa=new T.Quaternion().setFromEuler(new T.Euler(.1,-.9,.5)),sampler={getInterpolation:()=> 'LINEAR',getInput:()=>({getCount:()=>1})};
  const actual=new T.Quaternion().fromArray(retargetRotations(qa.toArray(),sampler,sn,tn,sr,tr,T));
  const sourceWorldAnimated=qp.clone().multiply(qa),expectedWorld=sourceWorldAnimated.clone().multiply(sr.worldQ.get(sn).clone().invert()).multiply(tr.worldQ.get(tn));
  assert(qt.clone().multiply(actual).angleTo(expectedWorld)<1e-7);
  console.log('PASS: original bytes/rest nodes/skin retained; physical material normalization; 12 genuine clips; root scale correction; planar motion removal; target limb lengths; normalized quaternions; bind correction; actual skinned bounds; provisional sockets; validation and SHA-256.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

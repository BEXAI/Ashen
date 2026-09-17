#!/usr/bin/env node
'use strict';
// A small integration fixture checks real skin/morph/animation data and metadata.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');

async function main() {
  const deps = path.resolve(process.argv[2] || '/Users/nathaniel/.cache/ashen-september-deps');
  const req = createRequire(path.join(deps, 'package.json'));
  const { Document, NodeIO, Accessor } = req('@gltf-transform/core');
  const sharp = req('sharp');
  const dir = path.join(__dirname, 'qa', 'rigged-fixture');
  await fs.mkdir(dir, { recursive: true });
  const doc = new Document(), buffer = doc.createBuffer('Preserved buffer').setExtras({ bufferTag: 99 });
  const acc = (name, type, array) => doc.createAccessor(name, buffer).setType(type).setArray(array).setExtras({ accessorTag: name });
  const pos = acc('positions', Accessor.Type.VEC3, new Float32Array([-1, 0, 0, 1, 0, 0, 1, 2, 0, -1, 2, 0]));
  const normals = acc('normals', Accessor.Type.VEC3, new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]));
  const uv = acc('uv', Accessor.Type.VEC2, new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]));
  const joints = acc('joints', Accessor.Type.VEC4, new Uint16Array([0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]));
  const weights = acc('weights', Accessor.Type.VEC4, new Float32Array([1, 0, 0, 0, 0.75, 0.25, 0, 0, 0.25, 0.75, 0, 0, 0, 1, 0, 0]));
  const indices = acc('indices', Accessor.Type.SCALAR, new Uint16Array([0, 1, 2, 0, 2, 3]));
  const texture = doc.createTexture('Fixture texture').setMimeType('image/png').setImage(await sharp({ create: { width: 2200, height: 32, channels: 4, background: { r: 120, g: 60, b: 240, alpha: 0.75 } } }).png().toBuffer()).setExtras({ textureTag: true });
  const material = doc.createMaterial('Fixture material').setBaseColorTexture(texture).setExtras({ materialTag: ['preserve', 1] });
  const morph = doc.createPrimitiveTarget('Breathing').setAttribute('POSITION', acc('morph positions', Accessor.Type.VEC3, new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0.125, 0, 0, 0.125]))).setExtras({ morphTag: 'kept' });
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', normals).setAttribute('TEXCOORD_0', uv).setAttribute('JOINTS_0', joints).setAttribute('WEIGHTS_0', weights).setIndices(indices).setMaterial(material).addTarget(morph).setExtras({ primitiveTag: 'kept' });
  const mesh = doc.createMesh('Skinned quad').addPrimitive(prim).setWeights([0]).setExtras({ meshTag: 1 });
  const rootBone = doc.createNode('RootBone').setExtras({ boneMetadata: 'root' });
  const childBone = doc.createNode('ChildBone').setTranslation([0, 1, 0]); rootBone.addChild(childBone);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const childBind = [...identity]; childBind[13] = -1;
  const skin = doc.createSkin('Two-bone skin').addJoint(rootBone).addJoint(childBone).setSkeleton(rootBone).setInverseBindMatrices(acc('inverse binds', Accessor.Type.MAT4, new Float32Array([...identity, ...childBind]))).setExtras({ skinTag: { nested: true } });
  const node = doc.createNode('Character').setMesh(mesh).setSkin(skin);
  doc.createScene('Fixture scene').addChild(rootBone).addChild(node).setExtras({ sceneTag: 1 });
  doc.getRoot().setDefaultScene(doc.getRoot().listScenes()[0]).setExtras({ rootTag: 'preserved' });
  const times = acc('times', Accessor.Type.SCALAR, new Float32Array([0, 0.5, 1]));
  const translation = acc('translation values', Accessor.Type.VEC3, new Float32Array([0, 1, 0, 0, 1.1234567, 0, 0, 1, 0]));
  const sampler = doc.createAnimationSampler().setInput(times).setOutput(translation).setInterpolation('LINEAR').setExtras({ samplerTag: 1 });
  const channel = doc.createAnimationChannel().setTargetNode(childBone).setTargetPath('translation').setSampler(sampler).setExtras({ channelTag: 1 });
  const morphSampler = doc.createAnimationSampler().setInput(times).setOutput(acc('morph weights', Accessor.Type.SCALAR, new Float32Array([0, 1, 0])));
  const morphChannel = doc.createAnimationChannel().setTargetNode(node).setTargetPath('weights').setSampler(morphSampler);
  doc.createAnimation('Idle').addSampler(sampler).addChannel(channel).addSampler(morphSampler).addChannel(morphChannel).setExtras({ animationTag: 1 });
  const input = path.join(dir, 'fixture.glb');
  await new NodeIO().write(input, doc);
  execFileSync(process.execPath, [path.join(__dirname, 'inspect-optimize-glb.cjs'), input, path.join(dir, 'output'), '--deps-root', deps, '--force'], { stdio: 'inherit' });
  const report = JSON.parse(await fs.readFile(path.join(dir, 'output', 'fixture.report.json'), 'utf8'));
  assert.equal(report.source.counts.bones, 2); assert.equal(report.source.counts.skins, 1);
  assert.equal(report.source.counts.animations, 1); assert.equal(report.source.counts.animationTracks, 2);
  assert.equal(report.source.counts.uniqueMeshTriangles, 2);
  assert.equal(report.source.meshes[0].primitives[0].skinWeights.nonNormalizedVertices, 0);
  for (const v of report.variants) {
    assert.equal(v.validation.direct.numErrors, 0); assert.equal(v.validation.decoded.numErrors, 0);
    assert(v.preservation.nonImageBufferViewsByteIdentical);
    assert(v.model.textures.every(t => t.dimensions[0] <= v.textureCap && t.dimensions[1] <= v.textureCap));
    assert.equal(v.model.textures[0].mimeType, 'image/webp');
    assert.deepStrictEqual(v.model.animations, report.source.animations);
    assert.deepStrictEqual(v.model.skins, report.source.skins);
  }
  // Exercise the non-extension path on the same rig and verify retained PNG.
  execFileSync(process.execPath, [path.join(__dirname, 'inspect-optimize-glb.cjs'), input, path.join(dir, 'fallback'), '--deps-root', deps, '--no-webp', '--no-meshopt', '--force'], { stdio: 'inherit' });
  const fallback = JSON.parse(await fs.readFile(path.join(dir, 'fallback', 'fixture.report.json'), 'utf8'));
  assert(fallback.variants.every(v => v.meshoptCompressedViews === 0 && v.model.textures[0].mimeType === 'image/png'));
  console.log('PASS: skin weights, joint hierarchy, inverse binds, morph data, animations, metadata, texture caps, both encoding paths, validation, SHA-256.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });

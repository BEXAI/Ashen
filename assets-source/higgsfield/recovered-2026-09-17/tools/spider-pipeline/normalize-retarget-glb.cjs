#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { parseGLB, serializeGLB, sha, validate } = require('./inspect-optimize-glb.cjs');
const { sampleSkinnedBounds } = require('./sample-skinned-bounds.cjs');
const REQUIRED = ['idle', 'forward', 'backward', 'strafe_left', 'strafe_right', 'dodge', 'hit', 'death', 'side', 'diagonal', 'backhand', 'overhead'];
const DEPS = require('../resolve-deps.cjs')(__dirname);
const clone = x => JSON.parse(JSON.stringify(x));
const text = x => JSON.stringify(x, null, 2) + '\n';
const clamp = x => Math.max(0, Math.min(1, x));
const boneKey = n => n.replace(/^.*:/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const HELP = `Usage: node normalize-retarget-glb.cjs TARGET.glb OUTPUT.glb [options]
  --clip NAME=/absolute/donor.glb   Repeat for each genuine source animation
                                  Optional source selection: donor.glb::ClipName
  --profile knight|nonmetal        Default knight (.35 metallic, .60 roughness)
  --materials-only                Preserve all existing authored clips/rig/sockets
  --metallic N --roughness N       Override profile values in [0,1]
  --provenance-json PATH           Embed exact asset/source provenance in extras
  --clip-duration NAME=SECONDS     Uniform retiming, preserving phase proportions
  --contact-bone RightHand         Socket parent; use LeftHand for a bow
  --contact-base X,Y,Z             Contact-bone local coordinates (both required)
  --contact-tip X,Y,Z              Provisional runtime equipment contact endpoint
  --deps-root PATH                 Existing project dependency directory
  --require-complete               Require all 12 canonical clips before GLB output
  --force                          Replace named output files

Target's own idle is normalized and retained as 'idle'. Donor rotations are
retargeted with source/target rest orientations. Donor bone translations/scales
are not copied. Hips retain scaled vertical movement; planar travel is removed.
No clips are fabricated, including turn: runtime actor yaw handles turning.
Without explicit socket coordinates only measurements/recommendations are emitted.
`;

function args(argv) {
  const o = { profile: 'knight', deps: DEPS, clips: [], durations: {}, contactBone: 'RightHand', force: false, requireComplete: false, materialsOnly: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; if (a === '--help' || a === '-h') return { help: true };
    if (a === '--force') o.force = true;
    else if (a === '--require-complete') o.requireComplete = true;
    else if (a === '--materials-only') o.materialsOnly = true;
    else if (['--clip', '--profile', '--metallic', '--roughness', '--contact-base', '--contact-tip', '--contact-bone', '--deps-root', '--provenance-json', '--clip-duration'].includes(a)) {
      if (argv[i + 1] == null) throw Error(`${a} needs a value`); const v = argv[++i];
      if (a === '--clip') { const eq = v.indexOf('='); if (eq <= 0) throw Error('--clip must be name=/path.glb'); const spec = v.slice(eq + 1).split('::'); o.clips.push({ name: v.slice(0, eq), path: path.resolve(spec[0]), animationName: spec.slice(1).join('::') || null }); }
      else if (a === '--profile') o.profile = v;
      else if (a === '--deps-root') o.deps = path.resolve(v);
      else if (a === '--provenance-json') o.provenancePath = path.resolve(v);
      else if (a === '--contact-bone') o.contactBone = v;
      else if (a === '--clip-duration') { const [name, raw] = v.split('='); const seconds = Number(raw); if (!name || !(seconds > 0) || !Number.isFinite(seconds)) throw Error('--clip-duration must be name=positiveSeconds'); o.durations[name] = seconds; }
      else if (a.startsWith('--contact-')) { const n = v.split(',').map(Number); if (n.length !== 3 || n.some(x => !Number.isFinite(x))) throw Error(`${a} requires three finite comma-separated numbers`); o[a === '--contact-base' ? 'contactBase' : 'contactTip'] = n; }
      else o[a.slice(2)] = Number(v);
    } else if (a.startsWith('-')) throw Error(`Unknown option ${a}`); else pos.push(a);
  }
  if (pos.length !== 2) throw Error(HELP);
  o.input = path.resolve(pos[0]); o.output = path.resolve(pos[1]);
  if (o.input === o.output || !o.output.endsWith('.glb')) throw Error('Output must be a separate .glb file.');
  if (!['knight', 'nonmetal'].includes(o.profile)) throw Error('Unknown material profile.');
  o.metallic ??= o.profile === 'knight' ? 0.35 : 0;
  o.roughness ??= o.profile === 'knight' ? 0.60 : 0.80;
  for (const k of ['metallic', 'roughness']) if (!Number.isFinite(o[k]) || o[k] < 0 || o[k] > 1) throw Error(`${k} must be in [0,1].`);
  if (!!o.contactBase !== !!o.contactTip) throw Error('Provide both contact socket coordinates, or neither.');
  if (new Set(o.clips.map(c => c.name)).size !== o.clips.length) throw Error('Duplicate canonical clip name.');
  if (o.clips.some(c => c.name === 'idle' || c.name === 'turn')) throw Error('Own idle is preserved automatically; turn belongs to runtime actor yaw.');
  if (o.materialsOnly && o.clips.length) throw Error('--materials-only cannot import animation clips.');
  return o;
}

class Appender {
  constructor(raw) {
    this.json = clone(raw.json); this.originalBin = Buffer.from(raw.bin);
    if (this.json.buffers?.length !== 1 || this.json.buffers[0].uri) throw Error('Target must be a single-buffer, self-contained GLB.');
    this.parts = [this.originalBin]; this.length = this.originalBin.length;
  }
  accessor(values, type, label, extras = undefined) {
    const array = new Float32Array(values); const dims = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    if (!dims || array.length % dims) throw Error('Invalid appended accessor shape.');
    for (const x of array) if (!Number.isFinite(x)) throw Error(`Non-finite data in ${label}`);
    const padding = (4 - this.length % 4) % 4; if (padding) { this.parts.push(Buffer.alloc(padding)); this.length += padding; }
    const data = Buffer.from(array.buffer); const view = this.json.bufferViews.length;
    this.json.bufferViews.push({ buffer: 0, byteOffset: this.length, byteLength: data.length });
    this.parts.push(data); this.length += data.length;
    const min = Array(dims).fill(Infinity), max = Array(dims).fill(-Infinity);
    for (let i = 0; i < array.length; i++) { min[i % dims] = Math.min(min[i % dims], array[i]); max[i % dims] = Math.max(max[i % dims], array[i]); }
    const index = this.json.accessors.length;
    this.json.accessors.push({ bufferView: view, componentType: 5126, count: array.length / dims, type, name: label, min, max, ...(extras ? { extras } : {}) });
    return index;
  }
  finish(extraChunks) { this.json.buffers[0].byteLength = this.length; return serializeGLB(this.json, Buffer.concat(this.parts), extraChunks); }
}

function rig(document, THREE) {
  const root = document.getRoot(), nodes = root.listNodes(), skin = root.listSkins()[0];
  if (!skin) return null;
  const joints = skin.listJoints(), jointSet = new Set(joints), names = new Map();
  for (const node of joints) { const k = boneKey(node.getName()); if (names.has(k)) throw Error(`Ambiguous bone name: ${node.getName()}`); names.set(k, node); }
  const world = new Map(), worldQ = new Map();
  for (const n of nodes) { const m = new THREE.Matrix4().fromArray(n.getWorldMatrix()); world.set(n, m); worldQ.set(n, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(m)).normalize()); }
  // Inverse binds preserve the actual orientation basis even if default nodes were posed.
  const ib = skin.getInverseBindMatrices();
  if (ib) joints.forEach((n, i) => { const bind = new THREE.Matrix4().fromArray(ib.getElement(i, [])).invert(); worldQ.set(n, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(bind)).normalize()); });
  const hips = names.get('hips') || joints.find(n => !jointSet.has(n.getParentNode()));
  const legLengths = [];
  for (const side of ['left', 'right']) {
    const chain = ['upleg', 'leg', 'foot'].map(s => names.get(side + s));
    if (chain.every(Boolean)) legLengths.push(chain.slice(1).reduce((sum, n, i) => sum + new THREE.Vector3().setFromMatrixPosition(world.get(n)).distanceTo(new THREE.Vector3().setFromMatrixPosition(world.get(chain[i]))), 0));
  }
  return { nodes, skin, joints, jointSet, names, world, worldQ, hips, legLength: legLengths.length ? legLengths.reduce((a, b) => a + b) / legLengths.length : null };
}

function values(accessor) { const result = [], e = []; for (let i = 0; i < accessor.getCount(); i++) { accessor.getElement(i, e); for (let j = 0; j < accessor.getElementSize(); j++) result.push(e[j]); } return result; }
function frameValueSlots(sampler, dims) { return { cubic: sampler.getInterpolation() === 'CUBICSPLINE', dims }; }
function clipExtent(animation) { const starts = animation.listSamplers().map(s => s.getInput().getMin([])[0]), ends = animation.listSamplers().map(s => s.getInput().getMax([])[0]); return { start: Math.min(...starts), end: Math.max(...ends), duration: Math.max(...ends) - Math.min(...starts) }; }

function rootScaleFactor(animation, sourceRig) {
  const c = animation.listChannels().find(c => c.getTargetNode() === sourceRig.hips && c.getTargetPath() === 'scale');
  if (!c) return { factor: 1, applied: false, reason: 'No root scale track' };
  const sampler = c.getSampler(), data = values(sampler.getOutput()), cubic = sampler.getInterpolation() === 'CUBICSPLINE';
  const v = data.filter((_, i) => !cubic || Math.floor(i / 3) % 3 === 1);
  const mean = v.reduce((a, b) => a + b, 0) / v.length, spread = Math.max(...v) - Math.min(...v);
  if (Math.abs(mean - 1) <= 0.02) return { factor: 1, applied: false, observedMean: mean, observedSpread: spread };
  if (!(mean > 0) || spread > 0.002) throw Error(`Nonuniform/animated root scale in ${animation.getName()}; not the constant Meshy scale bug.`);
  return { factor: mean, applied: true, observedMean: mean, observedSpread: spread, fix: 'Scale keys to one; divide same-root translation by observed constant factor', reference: 'https://raw.githubusercontent.com/higgsfield-ai/skills/main/higgsfield-websites/scripts/glb_merge_anims.py' };
}

function normalizeMaterials(json, o) {
  return (json.materials || []).map((m, index) => {
    const before = clone(m); m.pbrMetallicRoughness ||= {};
    m.pbrMetallicRoughness.metallicFactor = o.metallic; m.pbrMetallicRoughness.roughnessFactor = o.roughness;
    m.emissiveFactor = [0, 0, 0];
    const spec = m.extensions?.KHR_materials_specular;
    if (spec?.specularColorFactor) spec.specularColorFactor = spec.specularColorFactor.map(clamp);
    if (spec?.specularFactor != null) spec.specularFactor = clamp(spec.specularFactor);
    return { index, name: m.name, before, after: clone(m), textureReferencesRetained: true };
  });
}

function addTrack(builder, animation, nodeID, property, timeValues, output, type, interpolation = 'LINEAR', metadata = {}) {
  const input = builder.accessor(timeValues, 'SCALAR', `${animation.name}:${nodeID}:${property}:time`);
  const out = builder.accessor(output, type, `${animation.name}:${nodeID}:${property}:values`);
  const sampler = animation.samplers.length; animation.samplers.push({ input, output: out, interpolation });
  animation.channels.push({ sampler, target: { node: nodeID, path: property }, ...(Object.keys(metadata).length ? { extras: metadata } : {}) });
}

function hipTranslation(input, sampler, sourceRig, targetRig, scaleFactor, legRatio, THREE) {
  const srcRest = new THREE.Vector3().fromArray(sourceRig.hips.getTranslation());
  const dstRest = new THREE.Vector3().fromArray(targetRig.hips.getTranslation());
  const sourceParent = sourceRig.hips.getParentNode(), targetParent = targetRig.hips.getParentNode();
  const srcM = sourceParent ? sourceRig.world.get(sourceParent) : new THREE.Matrix4();
  const dstInverse = (targetParent ? targetRig.world.get(targetParent) : new THREE.Matrix4()).clone().invert();
  const srcBasis = new THREE.Matrix3().setFromMatrix4(srcM), dstBasisInverse = new THREE.Matrix3().setFromMatrix4(dstInverse);
  const cubic = sampler.getInterpolation() === 'CUBICSPLINE', out = [];
  for (let i = 0; i < input.length; i += 3) {
    const isTangent = cubic && Math.floor(i / 3) % 3 !== 1;
    const p = new THREE.Vector3().fromArray(input, i).multiplyScalar(1 / scaleFactor);
    if (!isTangent) p.sub(srcRest);
    p.applyMatrix3(srcBasis); p.set(0, p.y * legRatio, 0).applyMatrix3(dstBasisInverse);
    if (!isTangent) p.add(dstRest);
    out.push(...p.toArray());
  }
  return out;
}

function retargetRotations(input, sampler, sourceNode, targetNode, sourceRig, targetRig, THREE) {
  const srcParent = sourceNode.getParentNode(), dstParent = targetNode.getParentNode();
  const srcP = srcParent ? sourceRig.worldQ.get(srcParent) : new THREE.Quaternion();
  const dstP = dstParent ? targetRig.worldQ.get(dstParent) : new THREE.Quaternion();
  const left = dstP.clone().invert().multiply(srcP);
  const right = sourceRig.worldQ.get(sourceNode).clone().invert().multiply(targetRig.worldQ.get(targetNode));
  const cubic = sampler.getInterpolation() === 'CUBICSPLINE', out = []; let previous = null;
  for (let key = 0; key < sampler.getInput().getCount(); key++) {
    const width = cubic ? 12 : 4, frame = [];
    for (let section = 0; section < (cubic ? 3 : 1); section++) {
      const q = new THREE.Quaternion().fromArray(input, key * width + section * 4).premultiply(left).multiply(right);
      if (!cubic || section === 1) q.normalize();
      frame.push(q);
    }
    const value = frame[cubic ? 1 : 0];
    if (previous && previous.dot(value) < 0) for (const q of frame) q.set(-q.x, -q.y, -q.z, -q.w);
    previous = value.clone(); frame.forEach(q => out.push(...q.toArray()));
  }
  // Verify the correction maps source rest orientation onto target rest orientation.
  const srcRestLocal = srcP.clone().invert().multiply(sourceRig.worldQ.get(sourceNode));
  const expected = dstP.clone().invert().multiply(targetRig.worldQ.get(targetNode));
  const mapped = srcRestLocal.premultiply(left).multiply(right).normalize();
  if (mapped.angleTo(expected) > 0.0001) throw Error(`Rest orientation consistency check failed: ${targetNode.getName()}`);
  return out;
}

function importAnimation(builder, animation, name, sourceRig, targetRig, THREE, ownIdle, provenance, desiredDuration) {
  const extent = clipExtent(animation); if (!(extent.duration > 0)) throw Error(`Clip ${name} has no positive duration.`);
  const outputDuration = desiredDuration || extent.duration, timeScale = outputDuration / extent.duration;
  const rootScale = rootScaleFactor(animation, sourceRig);
  const legRatio = ownIdle ? 1 : targetRig.legLength && sourceRig.legLength ? targetRig.legLength / sourceRig.legLength : null;
  if (!ownIdle && !legRatio) throw Error(`Cannot measure thigh+shin lengths for ${name}; no guessed height scaling is applied.`);
  const result = { name, samplers: [], channels: [], extras: { ...animation.getExtras(), sourceAnimationName: animation.getName(), provenance, conversion: ownIdle ? 'own-idle-normalized' : 'rest-aware-rotational-retarget', hipsScaleFix: rootScale, verticalLegLengthRatio: legRatio, uniformTimeScale: timeScale } };
  const skipped = [], mapped = [], rotated = new Set(), translated = new Set(), scaled = new Set();
  for (const c of animation.listChannels()) {
    const sourceNode = c.getTargetNode(), property = c.getTargetPath(), sampler = c.getSampler();
    if (!sourceNode || !sampler) throw Error(`Incomplete source channel in ${name}`);
    const targetNode = ownIdle ? sourceNode : targetRig.names.get(boneKey(sourceNode.getName()));
    if (!targetNode || !targetRig.jointSet.has(targetNode)) { skipped.push({ sourceNode: sourceNode.getName(), property, reason: 'No target joint' }); continue; }
    const nodeID = targetRig.nodes.indexOf(targetNode), times = values(sampler.getInput()).map(t => (t - extent.start) * timeScale);
    let output = values(sampler.getOutput()), type = sampler.getOutput().getType();
    if (property === 'rotation') {
      if (!ownIdle) output = retargetRotations(output, sampler, sourceNode, targetNode, sourceRig, targetRig, THREE);
      rotated.add(targetNode);
    } else if (property === 'translation' && sourceNode === sourceRig.hips) {
      output = hipTranslation(output, sampler, sourceRig, targetRig, rootScale.factor, legRatio, THREE); translated.add(targetNode);
    } else if (property === 'scale' && sourceNode === sourceRig.hips) {
      const cubic = sampler.getInterpolation() === 'CUBICSPLINE'; output = output.map((_, i) => cubic && Math.floor(i / 3) % 3 !== 1 ? 0 : 1); scaled.add(targetNode);
    } else if (!ownIdle && (property === 'translation' || property === 'scale')) {
      skipped.push({ sourceNode: sourceNode.getName(), property, reason: 'Donor lengths/scales rejected; target rest values used' }); continue;
    } else if (!ownIdle) { skipped.push({ sourceNode: sourceNode.getName(), property, reason: 'Unsupported donor property' }); continue; }
    else { if (property === 'translation') translated.add(targetNode); if (property === 'scale') scaled.add(targetNode); }
    if (timeScale !== 1 && sampler.getInterpolation() === 'CUBICSPLINE') { const dims = sampler.getOutput().getElementSize(); output = output.map((v, i) => Math.floor(i / dims) % 3 === 1 ? v : v / timeScale); }
    addTrack(builder, result, nodeID, property, times, output, type, sampler.getInterpolation(), c.getExtras());
    mapped.push({ source: sourceNode.getName(), target: targetNode.getName(), property });
  }
  if (!ownIdle && rotated.size < targetRig.joints.length / 2) throw Error(`Clip ${name} only maps ${rotated.size}/${targetRig.joints.length} rotation tracks.`);
  // Explicit target constants prevent previous clips' position/scale tracks from leaking into a new clip.
  for (const joint of targetRig.joints) {
    const id = targetRig.nodes.indexOf(joint), times = [0, outputDuration];
    if (!translated.has(joint)) addTrack(builder, result, id, 'translation', times, [...joint.getTranslation(), ...joint.getTranslation()], 'VEC3');
    if (!scaled.has(joint)) { const s = joint === targetRig.hips ? [1, 1, 1] : joint.getScale(); addTrack(builder, result, id, 'scale', times, [...s, ...s], 'VEC3'); }
    if (!rotated.has(joint)) addTrack(builder, result, id, 'rotation', times, [...joint.getRotation(), ...joint.getRotation()], 'VEC4');
  }
  builder.json.animations.push(result);
  return { name, sourceAnimationName: animation.getName(), sourceDurationSeconds: extent.duration, outputDurationSeconds: outputDuration, uniformTimeScale: timeScale, phaseProportionsPreserved: true, channelCount: result.channels.length, rootScaleFix: rootScale, legLengthRatio: legRatio, mapped, skipped, targetBoneTranslationsUsed: !ownIdle, preservedTargetRestRotations: true, planarRootMotionRemoved: true, provenance };
}

function socketMeasurements(targetRig, document, THREE, contactBone = 'RightHand') {
  const hand = targetRig?.names.get(boneKey(contactBone)); if (!hand) return { available: false, reason: `No ${contactBone} joint` };
  const index = targetRig.joints.indexOf(hand), ib = targetRig.skin.getInverseBindMatrices();
  const inverse = ib ? new THREE.Matrix4().fromArray(ib.getElement(index, [])) : targetRig.world.get(hand).clone().invert();
  const points = [];
  for (const m of document.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), joints = p.getAttribute('JOINTS_0'), weights = p.getAttribute('WEIGHTS_0');
    if (!pos || !joints || !weights) continue;
    for (let i = 0; i < pos.getCount(); i++) {
      const j = joints.getElement(i, []), w = weights.getElement(i, []);
      if (j.reduce((n, v, k) => n + (v === index ? w[k] : 0), 0) >= 0.5) points.push(new THREE.Vector3().fromArray(pos.getElement(i, [])).applyMatrix4(inverse).toArray());
    }
  }
  const quantile = q => [0, 1, 2].map(axis => { const v = points.map(p => p[axis]).sort((a, b) => a - b); return v[Math.floor((v.length - 1) * q)] ?? null; });
  const world = targetRig.world.get(hand), units = new THREE.Vector3().setFromMatrixScale(world).toArray();
  const localPerMeter = 1 / units.reduce((a, b) => a + b, 0) * 3;
  const base = [0, .08 * localPerMeter, 0], tip = [0, .98 * localPerMeter, 0];
  return { available: true, nodeID: targetRig.nodes.indexOf(hand), nodeName: hand.getName(), localUnitsToWorldMeters: units, handWeightedVertexCount: points.length, handLocalPercentiles: { p05: quantile(.05), median: quantile(.5), p95: quantile(.95) }, restWorldPosition: new THREE.Vector3().setFromMatrixPosition(world).toArray(), localAxesInWorld: [[1,0,0],[0,1,0],[0,0,1]].map(a => new THREE.Vector3().fromArray(a).transformDirection(world).toArray()), recommended: { contactBase: base, contactTip: tip, contactBaseRestWorld: new THREE.Vector3().fromArray(base).applyMatrix4(world).toArray(), contactTipRestWorld: new THREE.Vector3().fromArray(tip).applyMatrix4(world).toArray(), contactLengthMeters: .90, gripCenter: [0, .08 * localPerMeter, 0], axis: `${contactBone} local +Y`, status: 'Provisional separate-equipment coordinates, not captured geometry. Runtime owner handles equipped geometry and visual validation.' } };
}

function addSockets(builder, measurements, o) {
  if (!o.contactBase) return { added: false, reason: 'No validated coordinates supplied; measurements only' };
  if (!measurements.available) throw Error(`Cannot add contact sockets without ${o.contactBone}.`);
  if (builder.json.nodes.some(n => ['ContactBase', 'ContactTip'].includes(n.name))) throw Error('Contact socket names already exist.');
  const hand = builder.json.nodes[measurements.nodeID]; hand.children ||= [];
  for (const [name, translation] of [['ContactBase', o.contactBase], ['ContactTip', o.contactTip]]) {
    hand.children.push(builder.json.nodes.length); builder.json.nodes.push({ name, translation, extras: { purpose: 'Swept weapon collision segment endpoint', coordinates: `${o.contactBone} local units`, origin: 'Explicit CLI coordinates; provisional equipment attachment, not measured held geometry' } });
  }
  return { added: true, contactBase: o.contactBase, contactTip: o.contactTip, parent: o.contactBone };
}

async function main() {
  const o = args(process.argv.slice(2)); if (o.help) { console.log(HELP); return; }
  const req = createRequire(path.join(o.deps, 'package.json')), core = req('@gltf-transform/core'), ext = req('@gltf-transform/extensions'), THREE = req('three'), validator = req('gltf-validator'), { MeshoptDecoder } = req('meshoptimizer');
  await MeshoptDecoder.ready;
  const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const input = await fs.readFile(o.input), raw = parseGLB(input), document = await io.readBinary(new Uint8Array(input)), targetRig = rig(document, THREE), builder = new Appender(raw);
  const report = { schemaVersion: 1, createdAtUTC: new Date().toISOString(), input: { path: o.input, bytes: input.length, sha256: sha(input) }, originalUntouched: true, materialProfile: o.profile, materials: normalizeMaterials(builder.json, o), rig: targetRig ? { joints: targetRig.joints.length, names: targetRig.joints.map(n => n.getName()), legLengthMeters: targetRig.legLength, hips: targetRig.hips.getName(), armature: targetRig.hips.getParentNode()?.getName(), armatureScale: targetRig.hips.getParentNode()?.getScale() } : null, clips: [], requiredCanonicalClips: REQUIRED, sourceValidation: (await validate(input, path.basename(o.input), validator)).issues };
  if (o.provenancePath) { report.sourceProvenance = JSON.parse(await fs.readFile(o.provenancePath, 'utf8')); builder.json.extras = { ...(builder.json.extras || {}), higgsfieldSource: report.sourceProvenance }; }
  builder.json.animations ||= [];
  if (targetRig && !o.materialsOnly) {
    const originals = document.getRoot().listAnimations();
    const idle = originals.find(a => /idle/i.test(a.getName())) || (originals.length === 1 ? originals[0] : null);
    if (idle) {
      const index = originals.indexOf(idle); builder.json.animations.splice(index, 1);
      report.clips.push(importAnimation(builder, idle, 'idle', targetRig, targetRig, THREE, true, { path: o.input, sha256: sha(input), originalClipName: idle.getName(), kind: 'target-own-idle' }));
    }
  } else if (o.clips.length) throw Error('Target has no skin; rotational retargeting requires a rigged target.');
  if (o.materialsOnly) report.clips = document.getRoot().listAnimations().map(a => ({ name: a.getName(), sourceAnimationName: a.getName(), sourceDurationSeconds: clipExtent(a).duration, outputDurationSeconds: clipExtent(a).duration, provenance: { path: o.input, sha256: sha(input), kind: 'existing-authored-animation-preserved' }, untouched: true }));
  for (const spec of o.clips) {
    if (builder.json.animations.some(a => a.name === spec.name)) throw Error(`Clip already exists: ${spec.name}`);
    const bytes = await fs.readFile(spec.path), donorDoc = await io.readBinary(new Uint8Array(bytes)), donorRig = rig(donorDoc, THREE);
    if (!donorRig) throw Error(`Donor lacks skin/bind pose: ${spec.path}`);
    const list = donorDoc.getRoot().listAnimations(), animation = spec.animationName ? list.find(a => a.getName() === spec.animationName) : list.length === 1 ? list[0] : null;
    if (!animation) throw Error(`Select one donor animation with donor.glb::ClipName: ${spec.path}`);
    let sourceMetadata = null; try { sourceMetadata = JSON.parse(await fs.readFile(spec.path.replace(/\.glb$/i, '.source.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    report.clips.push(importAnimation(builder, animation, spec.name, donorRig, targetRig, THREE, false, { path: spec.path, sha256: sha(bytes), kind: 'genuine-source-animation', sourceMetadata }, o.durations[spec.name]));
  }
  report.socketMeasurements = socketMeasurements(targetRig, document, THREE, o.contactBone); report.sockets = addSockets(builder, report.socketMeasurements, o);
  if (o.materialsOnly) report.sockets.existingPreserved = builder.json.nodes.filter(n => ['ContactBase','ContactTip'].includes(n.name)).map(n=>({name:n.name,translation:n.translation}));
  const available = builder.json.animations.map(a => a.name); report.availableClips = available;
  report.missingCanonicalClips = REQUIRED.filter(n => !available.includes(n)); report.animationSetComplete = report.missingCanonicalClips.length === 0;
  const originalNodeCount = raw.json.nodes?.length || 0;
  for (let i = 0; i < originalNodeCount; i++) { const a = clone(raw.json.nodes[i]), b = clone(builder.json.nodes[i]); if (o.contactBase && i === report.socketMeasurements.nodeID) { a.children ||= []; b.children = b.children.filter(id => id < originalNodeCount); } assert.deepStrictEqual(b, a, `Target node/rest transform changed: ${i}`); }
  for (const k of ['meshes', 'skins', 'images', 'textures', 'samplers', 'asset']) assert.deepStrictEqual(builder.json[k], raw.json[k], `Original target ${k} changed.`);
  const bytes = builder.finish(raw.extraChunks); assert(parseGLB(bytes).bin.subarray(0, raw.bin.length).equals(raw.bin), 'Original binary data changed.');
  report.rawSkinnedBounds = sampleSkinnedBounds(document, THREE);
  report.normalizedSkinnedBounds = sampleSkinnedBounds(await io.readBinary(new Uint8Array(bytes)), THREE);
  const validation = await validate(bytes, path.basename(o.output), validator); report.validation = validation.issues;
  report.output = { path: o.output, bytes: bytes.length, sha256: sha(bytes), targetRestNodesPreserved: true, originalGeometrySkinAndTextureBytesPreserved: true, targetBoneLengthsCopiedFromDonor: false };
  await fs.mkdir(path.dirname(o.output), { recursive: true });
  const reportPath = o.output.replace(/\.glb$/, '.retarget-report.json'), validationPath = o.output.replace(/\.glb$/, '.validation.json');
  for (const p of [o.output, reportPath, validationPath]) if (!o.force) { try { await fs.access(p); throw Error(`Output exists: ${p}; use --force.`); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  await fs.writeFile(reportPath, text(report)); await fs.writeFile(validationPath, text(validation));
  if (validation.issues.numErrors) throw Error(`Output validation failed; no GLB written. See ${validationPath}`);
  if (o.requireComplete && !report.animationSetComplete) throw Error(`Missing canonical clips: ${report.missingCanonicalClips.join(', ')}. Report written; no GLB published.`);
  assert.equal(sha(await fs.readFile(o.input)), sha(input), 'Original target changed during processing.');
  await fs.writeFile(o.output, bytes, { flag: o.force ? 'w' : 'wx' });
  console.log(text({ output: o.output, report: reportPath, sha256: sha(bytes), availableClips: available, missingCanonicalClips: report.missingCanonicalClips, validationErrors: validation.issues.numErrors, sockets: report.sockets, recommendation: report.socketMeasurements.recommended }));
}

module.exports = { REQUIRED, retargetRotations, hipTranslation, rootScaleFactor, rig };
if (require.main === module) main().catch(e => { console.error(`ERROR: ${e.message}`); process.exitCode = 1; });

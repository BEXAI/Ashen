import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

await mkdir('.sites-runtime/tests', { recursive: true });
const output = process.cwd() + '/.sites-runtime/tests/higgsfield.mjs';
await build({ stdin: { contents: 'export * from "./app/game/higgsfield-environment"; export {createWorld} from "./app/game/world"; export {newProgress} from "./app/game/model"; export * as T from "three"; export {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";', resolveDir: process.cwd() }, outfile: output, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
const { HiggsfieldEnvironment, HIGGSFIELD_MODELS, createWorld, newProgress, T, GLTFLoader } = await import(pathToFileURL(output).href);

async function loadModel(kind) {
  const bytes = await readFile(`public/assets/higgsfield-jutsu/${kind}.glb`);
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
function world() {
  const original = T.TextureLoader.prototype.load;
  T.TextureLoader.prototype.load = () => new T.Texture();
  try { return createWorld(newProgress(), 'low'); } finally { T.TextureLoader.prototype.load = original; }
}
function batches(scene) { return scene.children.filter(object => object.name.startsWith('Higgsfield:')); }

test('All five shipped Jutsu models replace real dungeon scenery with bounded material batches', async () => {
  const w = world(), architecture = w.architecture, gates = [...w.gates];
  const counts = {}, calls = [];
  w.higgsfieldTargets.forEach(target => { counts[target.kind] = (counts[target.kind] ?? 0) + 1; });
  assert.deepEqual(Object.keys(counts).sort(), [...HIGGSFIELD_MODELS].sort());
  assert.equal(counts.arch, 8); assert.equal(counts['ember-shrine'], 3); assert.equal(counts['torch-sconce'], 10);
  let lightsBefore = 0; w.scene.traverse(object => { if (object.isLight) lightsBefore++; });
  const assets = new HiggsfieldEnvironment(w.scene, w.higgsfieldTargets, () => {}, async kind => { calls.push(kind); return loadModel(kind); });
  const pending = assets.load(); assert.equal(assets.load(), pending);
  const report = await pending;
  assert.deepEqual(report.failed, []); assert.equal(report.loaded.length, 5); assert.equal(calls.length, 5);
  assert.ok(w.higgsfieldTargets.every(target => target.fallback.every(object => !object.visible)));
  assert.equal(w.architecture, architecture); assert.deepEqual(w.gates, gates);
  const geometries = new Set(); let materialBatches = 0, lightsAfter = 0;
  w.scene.traverse(object => { if (object.isLight) lightsAfter++; });
  assert.equal(lightsAfter, lightsBefore, 'review lighting must not be imported');
  for (const group of batches(w.scene)) {
    assert.ok(group.children.length <= 4);
    for (const mesh of group.children) {
      assert.ok(mesh.isInstancedMesh); materialBatches++; geometries.add(mesh.geometry);
      assert.ok(Number.isFinite(mesh.boundingSphere.radius));
      assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite));
    }
  }
  assert.ok(materialBatches <= 60);
  assert.equal([...geometries].reduce((sum, geometry) => sum + geometry.attributes.position.count / 3, 0), 26000);
  for (const target of w.higgsfieldTargets.filter(target => target.flame)) {
    const source = await loadModel(target.kind);
    for (const [name, effect] of [['FlameOrigin', target.flame], ['LightOrigin', target.light]]) {
      const anchor = source.getObjectByName(name).getWorldPosition(new T.Vector3());
      const expected = target.root.localToWorld(anchor);
      assert.ok(effect.getWorldPosition(new T.Vector3()).distanceTo(expected) < 1e-5);
    }
  }
  assets.updateVisibility(51);
  assert.ok(batches(w.scene).some(group => group.name.endsWith(':entry') && group.visible));
  assert.ok(batches(w.scene).filter(group => group.name.endsWith(':throne')).every(group => !group.visible));
  assets.updateVisibility(-69);
  assert.ok(batches(w.scene).filter(group => group.name.endsWith(':throne')).every(group => group.visible));
  assets.dispose(); assets.dispose();
  assert.equal(batches(w.scene).length, 0);
  assert.ok(w.higgsfieldTargets.every(target => target.fallback.every(object => object.visible)));
});

test('A failed model preserves its playable fallback while other asset families load', async () => {
  const w = world();
  const assets = new HiggsfieldEnvironment(w.scene, w.higgsfieldTargets, () => {}, kind => {
    if (kind === 'torch-sconce') throw new Error('unavailable');
    return loadModel(kind);
  });
  const report = await assets.load();
  assert.deepEqual(report.failed, ['torch-sconce']); assert.equal(report.loaded.length, 4);
  for (const target of w.higgsfieldTargets) assert.ok(target.fallback.every(object => object.visible === (target.kind === 'torch-sconce')));
  assets.dispose();
});

test('Graphics teardown prevents late downloads from attaching or retaining model resources', async () => {
  const w = world(), releases = [], resources = [];
  const assets = new HiggsfieldEnvironment(w.scene, w.higgsfieldTargets, () => assert.fail('late redraw'), () => new Promise(resolve => {
    const scene = new T.Group(), geometry = new T.BoxGeometry(), material = new T.MeshStandardMaterial();
    let geometryDisposals = 0, materialDisposals = 0;
    geometry.addEventListener('dispose', () => geometryDisposals++); material.addEventListener('dispose', () => materialDisposals++);
    scene.add(new T.Mesh(geometry, material));
    resources.push(() => [geometryDisposals, materialDisposals]); releases.push(() => resolve(scene));
  }));
  const pending = assets.load(); assets.dispose(); releases.forEach(release => release());
  await pending;
  assert.equal(batches(w.scene).length, 0);
  resources.forEach(read => assert.deepEqual(read(), [1, 1]));
});

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = await mkdtemp(join(tmpdir(), 'ashen-feedback-tests-'));
after(() => rm(dir, { recursive: true, force: true }));
const out = join(dir, 'feedback.mjs');
await build({ stdin: { contents: 'export * from "./app/game/damage-numbers"; export * from "./app/game/death-presentation"; export * from "./app/game/camera-clearance"; export * as T from "three";', resolveDir: root }, outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
const { T, DamageNumbers, DAMAGE_NUMBER_CAP, DAMAGE_NUMBER_LIFETIME, DeathPresentation, sampleDeathPresentation, EncounterFraming, clearCameraPosition } = await import(pathToFileURL(out).href);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const event = (targetId = 'target', options = {}) => ({ id: `hit:${targetId}`, targetId, outcome: 'damaged', healthDelta: 20, point: { x: 1, y: 2, z: 3 }, ...options });
function surfaceFactory() {
  const surfaces = [];
  return { surfaces, createCanvas: () => {
    const context = { labels: [], clearRect() {}, strokeText() {}, fillText(label) { this.labels.push(label); } };
    const canvas = { width: 0, height: 0, getContext: () => context, context };
    surfaces.push(canvas); return canvas;
  } };
}

test('Pool import/construction has no browser side effects and safely skips unavailable canvas', () => {
  assert.equal(typeof document, 'undefined');
  const scene = new T.Group(), numbers = new DamageNumbers(scene);
  assert.equal(numbers.allocatedCount, 0); assert.equal(numbers.emit(event()), false);
  assert.equal(scene.children.length, 0); numbers.dispose();
});

test('Only resolved positive HP loss creates a number; overkill displays clamped delta', () => {
  const factory = surfaceFactory(), numbers = new DamageNumbers(new T.Group(), factory);
  for (const sample of [event('a', { outcome: 'shielded' }), event('b', { outcome: 'evaded' }), ...[0, -1, NaN, Infinity].map(healthDelta => event('c', { healthDelta }))]) assert.equal(numbers.emit(sample), false);
  assert.equal(factory.surfaces.length, 0);
  assert.equal(numbers.emit(event()), true);
  assert.equal(factory.surfaces[0].context.labels.at(-1), '−20');
  assert.equal(numbers.emit(event('tiny', { healthDelta: .0001 })), true);
  assert.notEqual(factory.surfaces[1].context.labels.at(-1), '−0');
  numbers.dispose();
});

test('Newest label replaces target, duplicate event cannot refresh it, lifetime is bounded', () => {
  const factory = surfaceFactory(), scene = new T.Group(), numbers = new DamageNumbers(scene, factory);
  numbers.emit(event()); numbers.update(.5);
  assert.equal(numbers.emit(event()), false);
  numbers.update(.15); assert.equal(numbers.activeCount, 0);
  numbers.emit(event('target', { id: 'next' })); numbers.update(.3);
  numbers.emit(event('target', { id: 'newest', healthDelta: 3 }));
  assert.equal(numbers.activeCount, 1); assert.equal(numbers.allocatedCount, 1);
  assert.equal(factory.surfaces[0].context.labels.at(-1), '−3');
  near(scene.children[0].material.opacity, 1);
  numbers.update(DAMAGE_NUMBER_LIFETIME); assert.equal(numbers.activeCount, 0);
  numbers.dispose();
});

test('Prolonged burst stays at eight global surfaces, evicts oldest, and disposes each owned resource once', () => {
  const factory = surfaceFactory(), scene = new T.Group(), numbers = new DamageNumbers(scene, factory);
  for (let i = 0; i < 200; i++) {
    assert.equal(numbers.emit(event(`target-${i}`, { healthDelta: i + 1 })), true);
    assert.ok(numbers.activeCount <= DAMAGE_NUMBER_CAP); assert.ok(numbers.allocatedCount <= DAMAGE_NUMBER_CAP);
  }
  assert.equal(factory.surfaces.length, 8);
  assert.deepEqual(factory.surfaces.map(s => Number(s.context.labels.at(-1).slice(1))).sort((a, b) => a - b), [193, 194, 195, 196, 197, 198, 199, 200]);
  let materials = 0, textures = 0;
  for (const sprite of scene.children) {
    sprite.material.addEventListener('dispose', () => materials++);
    sprite.material.map.addEventListener('dispose', () => textures++);
  }
  numbers.dispose(); numbers.dispose();
  assert.equal(materials, 8); assert.equal(textures, 8); assert.equal(scene.children.length, 0);
  assert.equal(numbers.emit(event()), false);
});

test('Reduced motion suppresses label movement without changing lifetime or amount', () => {
  const factory = surfaceFactory(), scene = new T.Group(), numbers = new DamageNumbers(scene, factory);
  numbers.emit(event()); const initial = scene.children[0].position.y;
  numbers.update(.5, true); near(scene.children[0].position.y, initial);
  assert.equal(numbers.activeCount, 1); numbers.update(.15, true); assert.equal(numbers.activeCount, 0);
  numbers.dispose();
});

test('Death plays finite clip, holds final pose three seconds, fades .75 seconds then completes', () => {
  assert.deepEqual(sampleDeathPresentation(.4), { poseTime: .4, opacity: 1, complete: false });
  assert.deepEqual(sampleDeathPresentation(.8), { poseTime: .8, opacity: 1, complete: false });
  near(sampleDeathPresentation(3.8).opacity, 1);
  near(sampleDeathPresentation(4.175).opacity, .5);
  assert.deepEqual(sampleDeathPresentation(4.55), { poseTime: .8, opacity: 0, complete: true });
  assert.deepEqual(sampleDeathPresentation(100), { poseTime: .8, opacity: 0, complete: true });
});

test('Death adapter never sinks root, uses grounded native reaction and isolates shared materials during fade', () => {
  const material = new T.MeshBasicMaterial({ opacity: .8 });
  const body = new T.Mesh(new T.BoxGeometry(), material), group = new T.Group(); group.add(body); group.position.set(2, 4, 6);
  const other = new T.Mesh(new T.BoxGeometry(), material), poses = [];
  const death = new DeathPresentation({ group, body, visual: { reaction: (...args) => poses.push(args), resetPresentation() {} } }, 4);
  death.sample(4.175);
  assert.deepEqual(poses.at(-1), ['death', .8]);
  assert.deepEqual(group.position.toArray(), [2, 4, 6]);
  assert.notEqual(body.material, material); assert.equal(other.material, material);
  near(body.material.opacity, .4); near(other.material.opacity, .8);
  death.advance(.375); assert.equal(group.visible, false); assert.equal(death.complete, true);
  death.dispose(); assert.equal(body.material, material); assert.equal(group.visible, false);
  death.reset(); assert.equal(group.visible, true); near(death.age, 0);
  body.geometry.dispose(); other.geometry.dispose(); material.dispose();
});

test('Procedural fallback rests its rendered bounds on the floor without moving actor root', () => {
  const group = new T.Group(), body = new T.Mesh(new T.BoxGeometry(.6, 2, .4), new T.MeshBasicMaterial());
  body.position.y = 1; group.position.set(3, 2, 5); group.rotation.y = .7; group.scale.setScalar(1.4); group.add(body);
  const death = new DeathPresentation({ group, body }, 2);
  for (const age of [.1, .4, .8, 3.8]) {
    death.sample(age); group.updateWorldMatrix(true, true);
    near(new T.Box3().setFromObject(group, true).min.y, 2);
    assert.deepEqual(group.position.toArray(), [3, 2, 5]);
  }
  death.dispose(); body.geometry.dispose(); body.material.dispose();
});

function obstructionFor(boxes) {
  return (from, to) => {
    const vector = to.clone().sub(from), distance = vector.length(), ray = new T.Ray(from, vector.normalize());
    let nearest = Infinity;
    for (const box of boxes) {
      if (box.containsPoint(from)) return 0;
      const point = ray.intersectBox(box, new T.Vector3());
      if (point) { const at = point.distanceTo(from); if (at <= distance) nearest = Math.min(nearest, at); }
    }
    return nearest;
  };
}

test('Off-center wall missed by center ray is caught by the clearance bundle', () => {
  const target = new T.Vector3(), camera = new T.Vector3(0, 0, 8);
  const obstruction = obstructionFor([new T.Box3(new T.Vector3(.12, -2, 3), new T.Vector3(2, 2, 3.2))]);
  assert.equal(obstruction(target, camera), Infinity);
  const result = clearCameraPosition(target, camera, obstruction);
  assert.equal(result.obstructed, true); assert.equal(result.probes, 9); near(camera.z, 2.78);
});

test('Near-plane corners expand for landscape projection and final interpolation is checked separately', () => {
  const target = new T.Vector3(), obstruction = obstructionFor([new T.Box3(new T.Vector3(.5, -2, 3), new T.Vector3(1, 2, 3.2))]);
  const desired = new T.Vector3(-3, 0, 8);
  assert.equal(clearCameraPosition(target, desired, obstruction, { aspect: 4, near: .3 }).obstructed, false);
  const interpolated = new T.Vector3(0, 0, 8);
  assert.equal(clearCameraPosition(target, interpolated, obstruction, { aspect: 4, near: .3 }).obstructed, true);
  assert.ok(interpolated.z < 3);
});

test('Encounter framing remains bounded and returns smoothly to hero without changing actor inputs', () => {
  const framing = new EncounterFraming(), hero = new T.Vector3(2, 1.7, 3), boss = new T.Vector3(40, 8, -50);
  let result;
  for (let i = 0; i < 600; i++) {
    result = framing.update(hero, boss, 1 / 60);
    assert.ok(Math.hypot(result.focus.x - hero.x, result.focus.z - hero.z) <= 1.5 + 1e-12);
    assert.ok(result.extraDistance <= 1.2); assert.ok(result.focus.y - hero.y <= 1.2 + 1e-12);
  }
  near(result.extraDistance, 1.2);
  for (let i = 0; i < 600; i++) result = framing.update(hero, null, 1 / 60);
  near(result.extraDistance, 0); near(result.focus.distanceTo(hero), 0);
  assert.deepEqual(hero.toArray(), [2, 1.7, 3]); assert.deepEqual(boss.toArray(), [40, 8, -50]);
});

test('Framing exponential response is refresh independent; reduced motion transitions more gently', () => {
  const hero = new T.Vector3(), boss = new T.Vector3(6, 4, 0), results = [];
  for (const fps of [20, 30, 60, 120]) {
    const framing = new EncounterFraming(); let result;
    for (let i = 0; i < fps; i++) result = framing.update(hero, boss, 1 / fps);
    results.push(result.focus.clone());
  }
  for (const result of results) near(result.distanceTo(results[0]), 0);
  const normal = new EncounterFraming().update(hero, boss, .1), reduced = new EncounterFraming().update(hero, boss, .1, true);
  assert.ok(reduced.focus.distanceTo(hero) < normal.focus.distanceTo(hero));
});

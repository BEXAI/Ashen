import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.cwd();
await mkdir('.sites-runtime/tests', { recursive: true });
const outfile = path.join(root, '.sites-runtime/tests/mobile-runtime.mjs');
await build({ stdin: { contents: 'export * from "./app/game/mobile-runtime"; export { mobileAutoResolution, surfaceAsset, renderResolution } from "./app/game/graphics";', resolveDir: root }, bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
const { initialQuality, renderProfile, FramePacer, RenderLoop, AdaptiveResolution, SaveQueue, mobileAutoResolution, surfaceAsset, renderResolution } = await import(pathToFileURL(outfile).href);

test('Restricted preferences still start touch devices on Auto and desktop on Ultra', () => {
  const blocked = () => { throw new Error('Storage blocked'); };
  assert.equal(initialQuality(true, blocked), 'auto');
  assert.equal(initialQuality(false, blocked), 'high');
  assert.equal(initialQuality(true, () => null), 'auto');
  assert.equal(initialQuality(true, () => 'invalid'), 'auto');
});

test('Explicit graphics preferences, including 4K on iPhone, are retained', () => {
  for (const quality of ['auto', 'low', 'medium', 'high']) assert.equal(initialQuality(true, () => quality), quality);
});

test('Mobile Auto uses lighter textures, lights, shadows and effects', () => {
  const auto = renderProfile('auto', true);
  assert.equal(auto.textures, 'low');
  assert.equal(auto.ao, false);
  assert.equal(auto.reflections, false);
  assert.equal(auto.shadowSize, 512);
  assert.equal(auto.lights, 3);
  assert.equal(renderProfile('medium', true).ao, false);
  assert.equal(renderProfile('medium', true).reflections, false);
  assert.equal(renderProfile('medium', false).ao, true);
  assert.equal(renderProfile('medium', false).reflections, true);
  for (const quality of ['high', 'low', 'high']) {
    const profile = renderProfile(quality, true);
    assert.equal(profile.reflections, quality === 'high');
    assert.equal(profile.ao, quality === 'high');
  }
});

test('Mobile texture paths select local 1K assets and preserve HD/4K sets', () => {
  for (const family of ['floor', 'wall']) for (const kind of ['diff', 'normal', 'arm']) {
    assert.equal(surfaceAsset(family, kind, 'low'), `/assets/dungeon/${family}-${kind}-1k.webp`);
    assert.equal(surfaceAsset(family, kind, 'medium'), `/assets/dungeon/${family}-${kind}-2k.webp`);
    assert.equal(surfaceAsset(family, kind, 'high'), `/assets/dungeon/${family}-${kind}.webp`);
  }
});

test('Auto output respects portrait, landscape, hardware and scale limits', () => {
  for (const [w, h] of [[390, 844], [844, 390], [375, 280], [430, 932], [1024, 1366]]) {
    const out = mobileAutoResolution(w, h, 1);
    assert.ok(out.width <= 1600 && out.height <= 1600);
    assert.ok(out.ratio <= 2);
    assert.ok(out.width * out.height <= 1920 * 1080);
    const small = mobileAutoResolution(w, h, .65, 1024);
    assert.ok(small.width <= 1024 && small.height <= 1024);
    assert.ok(small.width < out.width && small.height < out.height);
    assert.deepEqual(mobileAutoResolution(w, h, 5), out);
    assert.deepEqual(mobileAutoResolution(w, h, .1), mobileAutoResolution(w, h, .65));
  }
  assert.deepEqual(renderResolution(1920, 1080, 'high'), { ratio: 2, width: 3840, height: 2160 });
});

test('120 Hz callbacks produce at most about 60 full renders per second', () => {
  for (const hz of [60, 120]) {
    const pacer = new FramePacer(60);
    let renders = 0;
    for (let i = 0; i < hz; i++) if (pacer.ready(i * 1000 / hz)) renders++;
    assert.ok(renders >= 59 && renders <= 61, `${hz} Hz produced ${renders} renders`);
    pacer.reset();
    assert.equal(pacer.ready(1), true);
  }
});

function frames() {
  let serial = 0;
  const pending = new Map();
  return {
    pending,
    request(cb) { pending.set(++serial, cb); return serial; },
    cancel(id) { pending.delete(id); },
    step(now) { const work = [...pending.values()]; pending.clear(); for (const cb of work) cb(now); },
  };
}

test('Pause renders once then stops scheduling GPU work; resume restarts', () => {
  const raf = frames(); let count = 0;
  const loop = new RenderLoop(() => count++, raf.request, raf.cancel);
  loop.invalidate(); loop.invalidate();
  assert.equal(raf.pending.size, 1);
  raf.step(0); assert.equal(count, 1);
  loop.pause(true); raf.step(17);
  assert.equal(count, 2); assert.equal(raf.pending.size, 0);
  loop.invalidate(); raf.step(34);
  assert.equal(count, 3); assert.equal(raf.pending.size, 0);
  loop.pause(false); raf.step(51);
  assert.equal(count, 4); assert.equal(raf.pending.size, 1);
  loop.dispose(); assert.equal(raf.pending.size, 0);
});

test('Backgrounding and lost contexts cancel pending frames until resumed', () => {
  const raf = frames(); let count = 0;
  const loop = new RenderLoop(() => count++, raf.request, raf.cancel);
  loop.invalidate(); loop.suspend(true); loop.pause(true); loop.invalidate();
  raf.step(1000); assert.equal(count, 0); assert.equal(raf.pending.size, 0);
  loop.suspend(false); raf.step(2000);
  assert.equal(count, 1); assert.equal(raf.pending.size, 0);
  loop.dispose(); loop.suspend(false); loop.pause(false); loop.invalidate();
  assert.equal(raf.pending.size, 0);
});

test('Sustained slow frames reduce Auto resolution, with a bounded floor', () => {
  const adaptive = new AdaptiveResolution();
  for (let i = 0; i < 80; i++) adaptive.sample(33);
  assert.equal(adaptive.scale, 1);
  for (let i = 0; i < 12; i++) adaptive.sample(33);
  assert.ok(adaptive.scale < 1);
  for (let i = 0; i < 1000; i++) adaptive.sample(33);
  assert.equal(adaptive.scale, .65);
  for (let i = 0; i < 190; i++) adaptive.sample(16.7);
  assert.ok(adaptive.scale > .65 && adaptive.scale < 1);
});

test('One delayed frame and background gaps do not lower quality', () => {
  const adaptive = new AdaptiveResolution();
  assert.equal(adaptive.sample(10000), false);
  adaptive.sample(100);
  for (let i = 0; i < 190; i++) adaptive.sample(16.7);
  assert.equal(adaptive.scale, 1);
  for (let i = 0; i < 70; i++) adaptive.sample(33);
  adaptive.resetSamples();
  for (let i = 0; i < 30; i++) adaptive.sample(33);
  assert.equal(adaptive.scale, 1);
});

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('Concurrent save triggers share a write and one latest-state follow-up', async () => {
  const queue = new SaveQueue(), gate = deferred(), writes = [];
  let state = 1;
  const task = async () => { writes.push(state); if (writes.length === 1) await gate.promise; return true; };
  const first = queue.run(task);
  await Promise.resolve();
  state = 2; const second = queue.run(task);
  state = 3; const third = queue.run(task);
  assert.equal(second, first); assert.equal(third, first);
  gate.resolve(); assert.equal(await first, true);
  assert.deepEqual(writes, [1, 3]);
  state = 4; assert.equal(await queue.run(task), true);
  assert.deepEqual(writes, [1, 3, 4]);
});

test('Failed saves stop queued writes and can be explicitly retried', async () => {
  const queue = new SaveQueue(), gate = deferred(); let writes = 0;
  const task = async () => { writes++; await gate.promise; return false; };
  const first = queue.run(task); await Promise.resolve(); queue.run(task); gate.resolve();
  assert.equal(await first, false); assert.equal(writes, 1);
  assert.equal(await queue.run(async () => true), true);
  await assert.rejects(queue.run(async () => { throw new Error('Offline'); }), /Offline/);
  assert.equal(await queue.run(async () => true), true);
});

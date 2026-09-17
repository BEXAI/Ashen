import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const gameRoot = process.env.GAME_ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const dir = await mkdtemp(join(tmpdir(), 'ashen-locomotion-tests-'));
after(() => rm(dir, { recursive: true, force: true }));
const out = join(dir, 'locomotion.mjs');
await build({ stdin: { contents: 'export * from "./app/game/locomotion"; export * from "./app/game/kinematic"; export * from "./app/game/combat"; export * from "./app/game/hazards"; export * from "./app/game/simulation-clock";', resolveDir: gameRoot }, outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
const { planMotion, createCollisionWorld, canOccupy, sampleMotionPath, STRIKES, createSwing, strikeDuration, swingStep, findWalkEscape, SimulationClock } = await import(pathToFileURL(out).href);
const near = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const speedOf = v => Math.hypot(v.x, v.z);
const world = createCollisionWorld([{ x: 0, z: 0, width: 100, depth: 100 }]);
const noTravel = strike => ({ ...strike, travel: 0 });
function state(options = {}) {
  return { x: 0, z: 0, radius: .45, velocity: { x: 0, z: 0 }, recoil: { x: 0, z: 0 }, dodgeAge: -1, dodgeDirection: { x: 0, z: 1 }, swing: null, ...options };
}
function step(s, intent, dt, collisionWorld = world, speed = 5.4) {
  const path = planMotion(s, intent, speed, dt, collisionWorld);
  // Timeline advancement belongs to the engine, not planMotion.
  if (s.dodgeAge >= 0) { s.dodgeAge += dt; if (s.dodgeAge >= .45 - 1e-12) s.dodgeAge = -1; }
  if (s.swing && swingStep(s.swing, dt).done) s.swing = null;
  return path;
}
function safePath(path, collisionWorld, radius) {
  near(path.segments[0].t0, 0); near(path.segments.at(-1).t1, 1);
  for (let i = 0; i <= 100; i++) {
    const p = sampleMotionPath(path, i / 100);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
    assert.ok(canOccupy(collisionWorld, p.x, p.z, radius), `blocked sample ${i}: ${JSON.stringify(p)}`);
  }
}

test('Walk accelerates at 48, brakes at 64, caps at 5.4, and eventually stops without reversal', () => {
  const s = state();
  step(s, { x: 1, z: 0 }, 1 / 60); near(s.velocity.x, .8);
  for (let i = 0; i < 20; i++) step(s, { x: 1, z: 0 }, 1 / 60);
  near(s.velocity.x, 5.4);
  const before = s.x;
  step(s, { x: 0, z: 0 }, 1 / 60); near(s.velocity.x, 5.4 - 64 / 60);
  for (let i = 0; i < 20; i++) step(s, { x: 0, z: 0 }, 1 / 60);
  near(s.velocity.x, 0); assert.ok(s.x > before);
  const stopped = s.x; step(s, { x: 0, z: 0 }, 1 / 60); near(s.x, stopped);
});

test('Sprint is capped at 8.6 and analog magnitude survives without a diagonal boost', () => {
  for (const [intent, speed, expected] of [
    [{ x: 1, z: 0 }, 8.6, 8.6], [{ x: .3, z: .4 }, 5.4, 2.7], [{ x: 1, z: 1 }, 5.4, 5.4],
  ]) {
    const s = state();
    for (let i = 0; i < 60; i++) step(s, intent, 1 / 60, world, speed);
    near(speedOf(s.velocity), expected);
  }
});

test('Reversing input brakes existing velocity before building speed in the new direction', () => {
  const s = state({ velocity: { x: 5.4, z: 0 } });
  step(s, { x: -1, z: 0 }, 1 / 60); near(s.velocity.x, 5.4 - 64 / 60);
  for (let i = 0; i < 30; i++) step(s, { x: -1, z: 0 }, 1 / 60);
  near(s.velocity.x, -5.4); near(s.velocity.z, 0);
});

test('Sprint-to-attack clamps locomotion immediately in windup, active and recovery', () => {
  for (const strike of STRIKES) {
    for (const [age, cap] of [[0, 2.43], [strike.windup, 1.35], [strike.windup + strike.active, 2.43]]) {
      const swing = createSwing(noTravel(strike), 0); swing.elapsed = age;
      const s = state({ swing, velocity: { x: 8.6, z: 0 } });
      const path = planMotion(s, { x: 1, z: 0 }, 8.6, 1 / 60, world);
      near(speedOf(s.velocity), cap); near(s.x, cap / 60);
      safePath(path, world, s.radius);
    }
  }
});

for (const requestedSpeed of [0, 1]) test(`Attack phase cap does not raise a slower actor's requested speed ${requestedSpeed}`, () => {
  const s = state({ velocity: { x: requestedSpeed, z: 0 }, swing: createSwing(noTravel(STRIKES[0]), 0) });
  planMotion(s, { x: 1, z: 0 }, requestedSpeed, 1 / 60, world);
  assert.ok(s.velocity.x <= requestedSpeed + 1e-9);
  assert.ok(s.x <= requestedSpeed / 60 + 1e-9);
});

test('A tick crossing windup-to-active splits its path and drops the cap before active travel', () => {
  for (const strike of STRIKES) for (const rate of [.85, 1, 1.7]) {
    const swing = createSwing(noTravel(strike), 0, rate); swing.elapsed = strike.windup - .005 * rate;
    const s = state({ swing, velocity: { x: 8.6, z: 0 } });
    const path = planMotion(s, { x: 1, z: 0 }, 8.6, 1 / 60, world);
    near(s.x, 2.43 * .005 + 1.35 * (1 / 60 - .005)); near(s.velocity.x, 1.35);
    near(sampleMotionPath(path, .005 / (1 / 60)).x, 2.43 * .005);
    assert.ok(path.segments.some(p => Math.abs(p.t1 - .3) < 1e-9));
  }
});

test('Attack exit restores acceleration toward walk speed, not an instant full-speed jump', () => {
  const strike = noTravel(STRIKES[0]), swing = createSwing(strike, 0);
  swing.elapsed = strikeDuration(strike) - .005;
  const s = state({ swing, velocity: { x: 2.43, z: 0 } });
  planMotion(s, { x: 1, z: 0 }, 5.4, 1 / 60, world);
  near(s.velocity.x, 2.43 + 48 * (1 / 60 - .005));
  assert.ok(s.velocity.x < 5.4);
});

test('Authored strike travel is added once across active time, including speed-scaled boundaries', () => {
  for (const strike of STRIKES) for (const rate of [.7, 1, 1.8]) for (const dt of [1 / 60, .1]) {
    const s = state({ swing: createSwing(strike, Math.PI / 2, rate) });
    let age = 0;
    while (age < strikeDuration(strike) / rate + dt) { step(s, { x: 0, z: 0 }, dt); age += dt; }
    near(s.x, strike.travel); near(s.z, 0); near(speedOf(s.velocity), 0);
  }
});

test('Dodge covers exactly 5.25 with fixed direction despite changing input and initial sprint velocity', () => {
  for (const dt of [1 / 20, 1 / 30, 1 / 60, 1 / 120, .45]) {
    const direction = Object.freeze({ x: .6, z: .8 });
    const s = state({ dodgeAge: 0, dodgeDirection: direction, velocity: { x: -8.6, z: 0 } });
    let time = 0;
    while (time < .45 - 1e-12) {
      const span = Math.min(dt, .45 - time);
      step(s, { x: time < .2 ? -1 : 1, z: -1 }, span); time += span;
    }
    near(s.x, 5.25 * .6); near(s.z, 5.25 * .8); near(speedOf(s.velocity), 0);
    assert.equal(s.dodgeDirection, direction);
  }
});

test('Dodge ending within a tick contributes only its remaining envelope then resumes acceleration', () => {
  const s = state({ dodgeAge: .44, dodgeDirection: { x: 0, z: 1 } });
  const path = planMotion(s, { x: 1, z: 0 }, 5.4, .02, world);
  near(s.z, 14 * .01 * .01 / (.30)); // Last .01 s of linearly declining speed.
  near(s.velocity.x, .48); near(s.x, .0048);
  near(sampleMotionPath(path, .5).x, 0);
});

test('Recoil decays at rate 12 and its integrated displacement is independent of partitioning', () => {
  for (const dt of [.4, .1, 1 / 60, 1 / 120]) {
    const s = state({ recoil: { x: 1.8, z: -2.4 } }); let time = 0;
    while (time < .4 - 1e-12) { const span = Math.min(dt, .4 - time); step(s, { x: 0, z: 0 }, span); time += span; }
    const decay = Math.exp(-12 * .4);
    near(s.recoil.x, 1.8 * decay); near(s.recoil.z, -2.4 * decay);
    near(s.x, 1.8 * (1 - decay) / 12); near(s.z, -2.4 * (1 - decay) / 12);
  }
});

test('Locomotion cap does not clamp separately added recoil or authored lunge', () => {
  const strike = STRIKES[0], swing = createSwing(strike, Math.PI / 2); swing.elapsed = strike.windup;
  const s = state({ swing, velocity: { x: 8.6, z: 0 }, recoil: { x: 3, z: 0 } });
  planMotion(s, { x: 1, z: 0 }, 8.6, 1 / 60, world);
  const expected = 1.35 / 60 + strike.travel / strike.active / 60 + 3 * (1 - Math.exp(-12 / 60)) / 12;
  near(s.velocity.x, 1.35); near(s.x, expected);
});

test('Thin wall stops full dodge path and removes inward velocity/recoil without losing tangent slide', () => {
  const collisionWorld = createCollisionWorld([{ x: 0, z: 0, width: 100, depth: 100 }], [{ id: 'thin gate', minX: 1, maxX: 1.01, minZ: -10, maxZ: 10 }]);
  const s = state({ dodgeAge: 0, dodgeDirection: { x: Math.SQRT1_2, z: Math.SQRT1_2 }, recoil: { x: 2, z: 1 } });
  const path = planMotion(s, { x: 1, z: 0 }, 8.6, .45, collisionWorld);
  assert.ok(s.x <= .55 && s.x > .5499); assert.ok(s.z > 3);
  near(s.recoil.x, 0); assert.ok(s.recoil.z > 0);
  safePath(path, collisionWorld, s.radius);
});

test('Wall blocking cancels inward locomotion/recoil and retains tangential velocity', () => {
  const collisionWorld = createCollisionWorld([{ x: 0, z: 0, width: 100, depth: 100 }], [{ id: 'wall', minX: 1, maxX: 1.1, minZ: -10, maxZ: 10 }]);
  const s = state({ x: .54, velocity: { x: 3, z: 3 }, recoil: { x: 2, z: .5 } });
  const path = planMotion(s, { x: Math.SQRT1_2, z: Math.SQRT1_2 }, 5.4, 1 / 60, collisionWorld);
  near(s.velocity.x, 0); near(s.recoil.x, 0); assert.ok(s.velocity.z > 3); assert.ok(s.recoil.z > 0);
  safePath(path, collisionWorld, s.radius);
});

test('Fixed simulation ticks give the same mixed motion under 20/30/60/120 Hz rendering', () => {
  const results = [];
  for (const fps of [20, 30, 60, 120]) {
    const clock = new SimulationClock(), s = state();
    for (let frame = 0; frame < fps * 2; frame++) clock.advanceFrame(1 / fps, dt => {
      const tick = clock.nextTick;
      if (tick === 21) s.swing = createSwing(STRIKES[3], 0);
      if (tick === 46) s.recoil = { x: -2, z: 1 };
      if (tick === 91) { s.swing = null; s.dodgeAge = 0; s.dodgeDirection = { x: 1, z: 0 }; }
      step(s, tick < 75 ? { x: .6, z: .8 } : { x: 0, z: 0 }, dt);
    });
    results.push(s);
  }
  for (const s of results) for (const key of ['x', 'z']) { near(s[key], results[0][key]); near(s.velocity[key], results[0].velocity[key]); near(s.recoil[key], results[0].recoil[key]); }
});

function escapeAdapter(snapshot, collisionWorld = world, currentIntent = { x: 0, z: 0 }) {
  return {
    snapshot, currentIntent,
    clone: s => ({ ...s, velocity: { ...s.velocity }, recoil: { ...s.recoil }, dodgeDirection: { ...s.dodgeDirection }, swing: s.swing ? { ...s.swing, hits: new Set(s.swing.hits) } : null }),
    step: (s, dt, intent) => step(s, intent, dt, collisionWorld, 5.4),
    position: s => s,
    legal: s => canOccupy(collisionWorld, s.x, s.z, s.radius),
  };
}

test('Escape uses the actual action-limited controller: ordinary walk escapes where committed overhead cannot', () => {
  const free = state(), swing = createSwing(STRIKES[3], 0); swing.elapsed = STRIKES[3].windup;
  const committed = state({ swing });
  assert.ok(findWalkEscape(escapeAdapter(free), { x: 0, z: 0 }, 1.4, .60));
  assert.equal(findWalkEscape(escapeAdapter(committed), { x: 0, z: 0 }, 1.4, .60), null);
  assert.equal(committed.x, 0); assert.equal(committed.z, 0); near(committed.swing.elapsed, STRIKES[3].windup);
});

test('Escape respects real floor clearance and initial .20 seconds of held intent', () => {
  const smallRoom = createCollisionWorld([{ x: 0, z: 0, width: 2.4, depth: 2.4 }]);
  assert.equal(findWalkEscape(escapeAdapter(state(), smallRoom), { x: 0, z: 0 }, 1.4, 1), null);
  const snapshot = state({ velocity: { x: -5.4, z: 0 } }), calls = [];
  const adapter = escapeAdapter(snapshot, world, { x: -1, z: 0 });
  const originalStep = adapter.step;
  adapter.step = (s, dt, intent) => { calls.push({ dt, intent }); originalStep(s, dt, intent); };
  const result = findWalkEscape(adapter, { x: 0, z: 0 }, 1.2, 1);
  assert.ok(result); near(calls.slice(0, 12).reduce((sum, c) => sum + c.dt, 0), .2);
  assert.ok(calls.slice(0, 12).every(c => c.intent === adapter.currentIntent));
  assert.ok(calls.slice(12).some(c => c.intent !== adapter.currentIntent));
  assert.deepEqual(snapshot.velocity, { x: -5.4, z: 0 });
});

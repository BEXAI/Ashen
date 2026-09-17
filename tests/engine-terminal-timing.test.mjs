import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.env.GAME_ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const dir = await mkdtemp(join(tmpdir(), 'ashen-engine-terminal-timing-'));
after(() => rm(dir, { recursive: true, force: true }));
const out = join(dir, 'runtime.mjs');
await build({ stdin: { contents: 'export {GameEngine} from "./app/game/engine";export {RenderLoop} from "./app/game/mobile-runtime";export {createMechanics} from "./app/game/engine-mechanics";export {newProgress} from "./app/game/model";export {knight} from "./app/game/world";export {AttackSequence} from "./app/game/combat";export * as T from "three";', resolveDir: root }, outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { GameEngine, RenderLoop, createMechanics, newProgress, knight, AttackSequence, T } = await import(pathToFileURL(out).href);
const STEP = 1 / 60;
const close = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);

// Exercise production engine methods without constructing a renderer, DOM or save API.
function fixture() {
  const g = Object.create(GameEngine.prototype), hero = knight();
  Object.assign(g, { mechanics: createMechanics(), p: newProgress(), paused: false, disposed: false, contextLost: false,
    combat: new AttackSequence(), facing: 0, yaw: 0, attackAnim: 0, bladeBase: new T.Vector3(), bladeTip: new T.Vector3(), bladeOrigin: new T.Vector3(),
    castCd: 2, dodgeCd: 1, dodgeTime: 0, stamina: 60, time: 0, last: 0, flash: .5, regen: 1, moving: 0,
    enemies: [], effects: [], keys: new Set(), stick: { x: 0, y: 0 }, touchSprint: false, attackHeld: false, actorList: [hero],
    world: { scene: new T.Scene(), hero, shrines: [], chests: [] }, sound: { tone() {}, suspend() {} }, events: [], emits: 0,
    reducedMotion: false, graphics: { version: 1, brightness: 1, impactShake: false }, quality: 'low', mobile: false,
    deathPresentations: new Map(), metrics: { measurements: { reset() {} } }, adaptive: { resetSamples() {} }, loopCalls: [], simulationCalls: 0 });
  Object.assign(g.p, { x: 0, z: 20, mana: 40, playtime: 23 });
  g.mechanics.spawnRemaining = .75;
  g.event = e => g.events.push(e); g.emit = () => g.emits++; g.onHud = () => {};
  g.loop = { pause: value => g.loopCalls.push(['pause', value]), setPresentationActive: value => g.loopCalls.push(['present', value]) };
  const simulate = GameEngine.prototype.stepSimulation;
  g.stepSimulation = (dt, tick) => { g.simulationCalls++; return simulate.call(g, dt, tick); };
  return g;
}

function gameplay(g) {
  const m = g.mechanics;
  return structuredClone({ progress: g.p, time: g.time, tick: m.clock.nextTick, gameTime: m.clock.gameTime,
    admitted: m.clock.totalAdmittedTime, dropped: m.clock.totalDroppedTime, frozen: m.clock.frozenRemaining,
    stamina: g.stamina, castCd: g.castCd, dodgeCd: g.dodgeCd, dodgeTime: g.dodgeTime, attackAnim: g.attackAnim,
    regen: g.regen, flash: g.flash, spawn: m.spawnRemaining, hazard: m.hazards.snapshot(), hazardTime: m.hazards.gameTime,
    boss: { action: m.boss.action, nextPattern: m.boss.nextPattern, nextDecisionAt: m.boss.nextDecisionAt },
    commands: m.commands.size, events: g.events, emits: g.emits, simulationCalls: g.simulationCalls });
}

function terminal(g, kind = 'death') {
  const m = g.mechanics;
  m.terminal = kind; g.p.health = 0; g.p.won = kind === 'victory';
  m.deaths.set('hero', 0); m.deaths.set(kind === 'victory' ? 'king' : 'w1', .2);
  g.pause(true, true);
}

function fakeFrames() {
  let serial = 0; const pending = new Map();
  return { pending, request(cb) { pending.set(++serial, cb); return serial; }, cancel(id) { pending.delete(id); },
    step(now) { const work = [...pending.values()]; pending.clear(); for (const cb of work) cb(now); } };
}

function attachLoop(g, present = false) {
  const raf = fakeFrames(), frames = [];
  g.loop = new RenderLoop(now => {
    // Same timestamp admission as GameEngine.frame; render/GPU work is deliberately absent.
    const rawDt = Math.max(0, (g.last ? now - g.last : 0) / 1000); g.last = now;
    const frame = g.advanceFrameTime(rawDt); frames.push(frame);
    if (present && (!g.paused || g.mechanics.terminalVisible)) g.presentActors(frame.alpha, frame.dt);
  }, raf.request, raf.cancel);
  return { raf, frames };
}

test('Ordinary engine pause freezes resources, clocks and warnings; resume discards captured input and partial time', () => {
  const g = fixture(), m = g.mechanics;
  g.advanceFrameTime(.01); g.attack(); m.clock.requestHitStop();
  assert.equal(m.commands.size, 1); assert.equal(m.clock.frozenRemaining, 2);
  m.hazards.start({ id: 'pause-warning', ownerId: 'king', actionId: '1', kind: 'eruption', center: { x: 0, z: 20 }, radius: 1.2, warningSeconds: 1, activeSeconds: .35, damageMultiplier: 1 });
  g.pause(true); const before = gameplay(g);
  assert.equal(m.commands.size, 0); assert.equal(m.clock.frozenRemaining, 0);
  for (let i = 0; i < 20; i++) assert.deepEqual(g.advanceFrameTime(.1), { dt: 0, stopped: 0, alpha: 1 });
  assert.deepEqual(gameplay(g), before); assert.equal(m.terminalVisible, false);
  g.pause(false); g.advanceFrameTime(STEP / 2);
  assert.equal(g.simulationCalls, 0, 'pre-pause fractional time must not complete a resumed tick');
  g.advanceFrameTime(STEP / 2);
  assert.equal(g.simulationCalls, 1); assert.equal(g.combat.swing, null); assert.equal(g.attackHeld, false);
  close(g.castCd, before.castCd - STEP); close(g.p.mana, before.progress.mana + .1); close(g.stamina, before.stamina + .3);
  close(g.p.playtime, before.progress.playtime + STEP); close(m.clock.gameTime, STEP);
});

test('Death and mutual-victory continuation advances only death presentation, never gameplay resources, hazards or playtime', () => {
  for (const kind of ['death', 'victory']) {
    const g = fixture(), m = g.mechanics; g.advanceFrameTime(STEP); terminal(g, kind);
    // A retained warning is a sentry: even if a subsystem retains state, presentation cannot advance it.
    // Actual lethal resolution also cancels owner hazards, covered by engine combat tests.
    m.hazards.start({ id: 'sentry', ownerId: 'king', actionId: '1', kind: 'eruption', center: { x: 0, z: 20 }, radius: 1.2, warningSeconds: .05, activeSeconds: .35, damageMultiplier: 1 }, m.clock.gameTime);
    const before = gameplay(g), ages = new Map(m.deaths);
    for (let i = 0; i < 10; i++) assert.deepEqual(g.advanceFrameTime(.25), { dt: .1, stopped: 0, alpha: 1 });
    close(m.terminalAge, 1); for (const [id, age] of ages) close(m.deaths.get(id), age + 1, id);
    assert.deepEqual(gameplay(g), before); assert.equal(m.hazards.snapshot().pulseEmitted, false);
    assert.equal(g.paused, true); assert.equal(m.terminal, kind);
  }
});

test('Real render loop retires the hero after finite terminal continuation and schedules no further paused work', () => {
  const g = fixture(), m = g.mechanics, { raf, frames } = attachLoop(g, true); terminal(g);
  const before = gameplay(g);
  for (let i = 0; i < 400; i++) raf.step(1 + i * 1000 / 60);
  assert.ok(m.terminalAge >= 4.55 && m.terminalAge < 4.55 + STEP + 1e-8, `terminal age ${m.terminalAge}`);
  assert.equal(g.world.hero.group.visible, false); assert.equal(g.deathPresentations.has('hero'), false);
  assert.equal(raf.pending.size, 0); assert.deepEqual(gameplay(g), before);
  const finalAge = m.terminalAge, finalAges = [...m.deaths], draws = frames.length;
  raf.step(100000); assert.equal(frames.length, draws);
  assert.deepEqual(g.advanceFrameTime(20), { dt: 0, stopped: 0, alpha: 1 });
  assert.equal(m.terminalAge, finalAge); assert.deepEqual([...m.deaths], finalAges);
  // Reopening an already-completed terminal overlay may invalidate one still frame, never the continuation.
  g.pause(true, true); raf.step(100017); assert.equal(raf.pending.size, 0); assert.equal(m.terminalAge, finalAge);
  g.loop.dispose();
});

test('Ordinary pause hides the terminal continuation; restoring its overlay resumes the same corpse ages without replay', () => {
  const g = fixture(), m = g.mechanics; terminal(g, 'victory');
  g.advanceFrameTime(.1); g.advanceFrameTime(.1); g.pause(true);
  const before = gameplay(g), age = m.terminalAge, deaths = [...m.deaths];
  assert.equal(m.terminalVisible, false);
  for (let i = 0; i < 30; i++) g.advanceFrameTime(.1);
  assert.equal(m.terminalAge, age); assert.deepEqual([...m.deaths], deaths); assert.deepEqual(gameplay(g), before);
  g.pause(true, true); assert.equal(m.terminalVisible, true); g.advanceFrameTime(STEP);
  close(m.terminalAge, age + STEP); for (const [id, value] of deaths) close(m.deaths.get(id), value + STEP);
  assert.deepEqual(gameplay(g), before); assert.equal(g.p.won, true); assert.equal(g.p.health, 0);
  const living = fixture(); living.pause(true, true);
  assert.equal(living.mechanics.terminalVisible, false); assert.equal(living.advanceFrameTime(.1).dt, 0);
});

test('Suspending the real loop freezes terminal age and restoration drops the hidden interval before continuing', () => {
  const g = fixture(), m = g.mechanics, { raf, frames } = attachLoop(g); terminal(g);
  raf.step(1); raf.step(51); close(m.terminalAge, .05);
  const before = gameplay(g), age = m.terminalAge, deaths = [...m.deaths], draws = frames.length;
  // The constructor visibility/page lifecycle handlers perform these same operations.
  // This verifies their timing contract; it does not dispatch browser DOM lifecycle events.
  g.last = 0; m.clock.reset(); g.loop.suspend(true); g.clearInput();
  assert.equal(raf.pending.size, 0); raf.step(30000); raf.step(90000);
  assert.equal(frames.length, draws); assert.equal(m.terminalAge, age); assert.deepEqual([...m.deaths], deaths);
  g.last = 0; m.clock.reset(); g.loop.suspend(false); raf.step(120001);
  assert.equal(frames.at(-1).dt, 0); assert.equal(m.terminalAge, age); assert.deepEqual([...m.deaths], deaths);
  raf.step(120051); close(m.terminalAge, age + .05);
  for (const [id, value] of deaths) close(m.deaths.get(id), value + .05);
  assert.deepEqual(gameplay(g), before); assert.equal(raf.pending.size, 1); g.loop.dispose();
});

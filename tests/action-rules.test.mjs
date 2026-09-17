import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'ashen-action-tests-'));
after(() => rm(dir, { recursive: true, force: true }));
const out = join(dir, 'actions.mjs');
await build({ entryPoints: [fileURLToPath(new URL('../app/game/action-rules.ts', import.meta.url))], outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
const {
  DODGE_RULES, SPAWN_PROTECTION_SECONDS, canStartDodge, canStartStrike,
  isDodgeProtected, isSpawnProtected, dodgeSpeedAt, dodgeTravelBetween,
  dodgeDirection, nextStrikeHeld, TickCommandQueue,
} = await import(pathToFileURL(out).href);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('Dodge integrates exactly to 5.25 across render rates and a hitch crossing both phase boundaries', () => {
  for (const parts of [[1 / 20], [1 / 30], [1 / 60], [1 / 120], [.29, .21], [.017, .041, .1]]) {
    let time = 0, travelled = 0, index = 0;
    while (time < .5) {
      const next = time + parts[index++ % parts.length];
      travelled += dodgeTravelBetween(time, next); time = next;
    }
    near(travelled, 5.25);
  }
  near(dodgeTravelBetween(-1, .3), 4.2);
  near(dodgeTravelBetween(.3, 5), 1.05);
  near(dodgeTravelBetween(.29, .31), .14 + .14 - 14 * .01 * .01 / (.3));
  assert.equal(dodgeTravelBetween(.45, 1), 0);
  assert.equal(dodgeTravelBetween(.3, .2), 0);
});

test('Dodge speed is continuous at deceleration start and zero beyond the action', () => {
  assert.equal(dodgeSpeedAt(-.1), 0);
  assert.equal(dodgeSpeedAt(0), 14);
  assert.equal(dodgeSpeedAt(.3), 14);
  near(dodgeSpeedAt(.375), 7);
  assert.equal(dodgeSpeedAt(.45), 0);
  assert.equal(dodgeSpeedAt(1), 0);
  assert.equal(dodgeSpeedAt(NaN), 0);
  assert.throws(() => dodgeTravelBetween(0, NaN), RangeError);
});

test('Protection is half-open and independent of one-second spawn protection', () => {
  for (const [time, expected] of [[-.1, false], [0, false], [.049, false], [.05, true], [.299, true], [.30, false], [.45, false]]) {
    assert.equal(isDodgeProtected(time), expected, `dodge ${time}`);
  }
  assert.equal(SPAWN_PROTECTION_SECONDS, 1);
  assert.equal(isSpawnProtected(1), true);
  assert.equal(isSpawnProtected(.00001), true);
  assert.equal(isSpawnProtected(0), false);
  assert.equal(isSpawnProtected(NaN), false);
  // A spawn timer is not a dodge elapsed value or movement request.
  assert.equal(isDodgeProtected(SPAWN_PROTECTION_SECONDS), false);
  assert.equal(dodgeSpeedAt(SPAWN_PROTECTION_SECONDS), 0);
});

test('Dodge accepts windup/recovery/cast cancellation but rejects committed contact and unavailable resources', () => {
  const ready = { alive: true, paused: false, stamina: 25, cooldown: 0, action: 'idle' };
  assert.equal(canStartDodge(ready), true);
  for (const attackPhase of ['windup', 'recovery']) assert.equal(canStartDodge({ ...ready, action: 'attack', attackPhase }), true);
  assert.equal(canStartDodge({ ...ready, action: 'cast' }), true);
  for (const blocked of [
    { action: 'attack', attackPhase: 'active' }, { action: 'attack' }, { action: 'dodge' },
    { alive: false }, { paused: true }, { stamina: 24.999 }, { stamina: NaN }, { cooldown: .001 },
  ]) assert.equal(canStartDodge({ ...ready, ...blocked }), false, JSON.stringify(blocked));
  const state = { ...ready };
  if (canStartDodge(state)) { state.stamina -= DODGE_RULES.staminaCost; state.cooldown = DODGE_RULES.cooldown; state.action = 'dodge'; }
  assert.equal(state.stamina, 0);
  assert.equal(canStartDodge(state), false, 'same action cannot charge a second start');
});

test('Strike admission respects the selected strike cost and never starts inside another action', () => {
  const ready = { alive: true, paused: false, action: 'idle', stamina: 15, staminaCost: 15 };
  assert.equal(canStartStrike(ready), true);
  assert.equal(canStartStrike({ ...ready, stamina: 14.999 }), false);
  for (const action of ['attack', 'dodge', 'cast']) assert.equal(canStartStrike({ ...ready, action }), false);
  assert.equal(canStartStrike({ ...ready, alive: false }), false);
  assert.equal(canStartStrike({ ...ready, paused: true }), false);
  assert.equal(canStartStrike({ ...ready, staminaCost: NaN }), false);
});

test('Dodge direction normalizes analog/diagonal intent once and falls back to facing', () => {
  const a = dodgeDirection(.1, .1, 0), b = dodgeDirection(1, 1, 0);
  near(a.x, b.x); near(a.z, b.z); near(Math.hypot(a.x, a.z), 1);
  const fallback = dodgeDirection(0, 0, Math.PI / 2);
  near(fallback.x, 1); near(fallback.z, 0);
  assert.throws(() => dodgeDirection(NaN, 0, 0), RangeError);
});

test('Prior held strike survives dodge; new presses during dodge are ignored and release/cancel clears intent', () => {
  assert.equal(nextStrikeHeld(false, true, false), true);
  assert.equal(nextStrikeHeld(true, true, true), true);
  assert.equal(nextStrikeHeld(false, true, true), false);
  assert.equal(nextStrikeHeld(true, false, true), false);
  assert.equal(nextStrikeHeld(true, false, false), false);
});

test('Tick commands are ordered by target time then sequence and consumed only once', () => {
  const queue = new TickCommandQueue();
  const future = queue.enqueue('later', 9), first = queue.enqueue('dodge', 3), second = queue.enqueue('strike', 3);
  assert.deepEqual(queue.drain(2), []);
  assert.deepEqual(queue.drain(3), [first, second]);
  assert.deepEqual(queue.drain(3), []);
  assert.deepEqual(queue.drain(9), [future]);
  const beforeClear = queue.enqueue('stale held edge', 10);
  queue.clear();
  const afterClear = queue.enqueue('new edge', 10);
  assert.ok(afterClear.sequence > beforeClear.sequence);
  assert.deepEqual(queue.drain(10), [afterClear]);
  for (const tick of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => queue.enqueue('bad', tick), RangeError);
});

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'ashen-clock-tests-'));
after(() => rm(dir, { recursive: true, force: true }));
const out = join(dir, 'clock.mjs');
await build({
  stdin: {
    contents: 'export * from "./simulation-clock"; export * from "./action-rules";',
    resolveDir: fileURLToPath(new URL('../app/game/', import.meta.url)),
  },
  outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
});
const { SimulationClock, SIMULATION_STEP: STEP, TickCommandQueue } = await import(pathToFileURL(out).href);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('Normal frame partitions and sub-100ms hitches reproduce identical tick-stamped combat traces', () => {
  function replay(parts) {
    const clock = new SimulationClock(), input = new TickCommandQueue();
    for (const [tick, velocity] of [[1, 5.4], [61, -2], [130, 0], [170, 8.6]]) input.enqueue(velocity, tick);
    const state = { x: 0, velocity: 0, health: 100, stamina: 50 }, trace = [];
    let elapsed = 0, frame = 0, frozen = 0;
    while (elapsed < 4 - 1e-12) {
      const dt = Math.min(parts[frame++ % parts.length], 4 - elapsed);
      const result = clock.advanceFrame(dt, (step, context) => {
        for (const command of input.drain(context.tick)) state.velocity = command.payload;
        state.x += state.velocity * step;
        state.stamina = Math.min(100, state.stamina + 18 * step);
        if ([20, 100, 179].includes(context.tick)) {
          state.health -= 7;
          clock.requestHitStop();
          clock.requestHitStop(); // Two accepted contacts request max, not sum.
        }
        trace.push({ ...context, ...state });
      });
      assert.ok(result.opportunities <= 6);
      assert.equal(result.droppedTime, 0);
      frozen += result.frozenOpportunities;
      elapsed += dt;
    }
    assert.equal(frozen, 6);
    assert.equal(trace.length, 234);
    near(clock.gameTime, 3.9);
    near(clock.totalAdmittedTime, 4);
    return trace;
  }
  const baseline = replay([1 / 60]);
  for (const parts of [[1 / 20], [1 / 30], [1 / 120], [.007, .043, .1, .011, .039]]) {
    assert.deepEqual(replay(parts), baseline);
  }
});

test('250ms foreground stall drops overload while preserving an earlier fractional remainder', () => {
  const clock = new SimulationClock(), ids = [];
  let frame = clock.advanceFrame(STEP / 2, (_, context) => ids.push(context.tick));
  assert.equal(frame.ticks, 0); near(frame.alpha, .5);
  frame = clock.advanceFrame(.25, (_, context) => ids.push(context.tick));
  assert.equal(frame.opportunities, 6);
  near(frame.admittedTime, .1); near(frame.droppedTime, .15); near(frame.alpha, .5);
  frame = clock.advanceFrame(STEP / 2, (_, context) => ids.push(context.tick));
  assert.equal(frame.ticks, 1); near(frame.alpha, 0);
  assert.deepEqual(ids, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(clock.advanceFrame(0, () => assert.fail('catch-up backlog')).opportunities, 0);
});

test('Hit stop starts on the next opportunity, consumes frame budget, and never repeats simulation callbacks', () => {
  const clock = new SimulationClock(), ticks = [];
  const result = clock.advanceFrame(.1, (dt, context) => {
    assert.equal(dt, STEP); ticks.push(context.tick);
    if (context.tick === 1) { clock.requestHitStop(); clock.requestHitStop(); }
  });
  assert.deepEqual(ticks, [1, 2, 3, 4]);
  assert.equal(result.opportunities, 6);
  assert.equal(result.frozenOpportunities, 2);
  assert.equal(result.frozenRemaining, 0);
  assert.equal(result.holdPresentation, false);
  near(result.gameTime, 4 * STEP);
});

test('Held pose survives a zero-tick render and the last frozen opportunity', () => {
  const clock = new SimulationClock();
  assert.equal(clock.advanceFrame(STEP, () => clock.requestHitStop()).holdPresentation, true);
  assert.equal(clock.advanceFrame(STEP / 2, () => assert.fail('too early')).holdPresentation, true);
  let frame = clock.advanceFrame(STEP * 1.5, () => assert.fail('must be frozen'));
  assert.equal(frame.frozenOpportunities, 2);
  assert.equal(frame.frozenRemaining, 0);
  assert.equal(frame.holdPresentation, true);
  frame = clock.advanceFrame(STEP, () => {});
  assert.equal(frame.ticks, 1); assert.equal(frame.holdPresentation, false);
});

test('Lifecycle reset discards fractional time and freeze without reusing tick IDs', () => {
  const clock = new SimulationClock();
  clock.advanceFrame(STEP * 1.5, () => clock.requestHitStop());
  const admitted = clock.totalAdmittedTime;
  clock.reset();
  assert.equal(clock.nextTick, 2); assert.equal(clock.frozenRemaining, 0);
  assert.equal(clock.totalAdmittedTime, admitted);
  const first = clock.advanceFrame(STEP / 2, () => assert.fail('stale remainder'));
  assert.equal(first.ticks, 0); near(first.alpha, .5);
  const second = clock.advanceFrame(STEP / 2, (_, context) => assert.equal(context.tick, 2));
  assert.equal(second.ticks, 1); near(second.gameTime, 2 * STEP);
});

test('Commands captured during hit stop execute once on the next unfrozen tick', () => {
  const clock = new SimulationClock(), queue = new TickCommandQueue(), consumed = [];
  clock.advanceFrame(STEP, () => clock.requestHitStop());
  const edge = queue.enqueue('dodge', clock.nextTick);
  clock.advanceFrame(STEP * 2, () => assert.fail('frozen tick'));
  assert.equal(queue.size, 1);
  clock.advanceFrame(STEP * 2, (_, context) => consumed.push(...queue.drain(context.tick)));
  assert.deepEqual(consumed, [edge]);
});

test('Negative elapsed is harmless; nonfinite elapsed is rejected without poisoning diagnostics', () => {
  const clock = new SimulationClock();
  assert.equal(clock.advanceFrame(-3, () => assert.fail()).ticks, 0);
  for (const dt of [NaN, Infinity, -Infinity]) assert.throws(() => clock.advanceFrame(dt, () => {}), RangeError);
  assert.equal(clock.totalAdmittedTime, 0); assert.equal(clock.totalDroppedTime, 0);
  assert.equal(clock.advanceFrame(STEP, () => {}).ticks, 1);
});

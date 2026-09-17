import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
await mkdir('.sites-runtime/tests', { recursive: true });
const out = process.cwd() + '/.sites-runtime/tests/combat.mjs';
await build({ stdin: { contents: 'export * from "./app/game/combat";export * from "./app/game/combat-animation";export {knight} from "./app/game/character-skins";export * as T from "three";', resolveDir: process.cwd() }, outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
const { STRIKES, AttackSequence, createSwing, swingStep, strikeDuration, activeInterval, travelBetween, bladeHitsCapsule, applyStrikePose, bladeSegment, WeaponTrail, knight, T } = await import(pathToFileURL(out).href);

test('A held chain cycles all four moves, charges distinct stamina, and resets after a gap', () => {
  const chain = new AttackSequence(); let time = 0, stamina = 100;
  for (const expected of STRIKES) {
    const swing = chain.start(time, stamina, 0, true);
    assert.equal(swing.strike.id, expected.id); stamina -= swing.strike.stamina;
    assert.equal(chain.start(time, stamina, 0, true), null);
    time += strikeDuration(expected); chain.finish(time);
  }
  assert.equal(stamina, 59);
  assert.equal(chain.start(time + 1, 100, 0, true).strike.id, 'side');
});
test('Only one recent queued tap survives recovery; cancelled or expired input cannot fire', () => {
  const c = new AttackSequence(); c.queue(0); c.start(0, 100, 0);
  c.queue(.5); c.queue(.51); c.finish(.58);
  assert.equal(c.start(.59, 100, 0).strike.id, 'diagonal');
  c.queue(.6); c.finish(1.2); assert.equal(c.start(1.21, 100, 0), null);
  c.queue(1.22); c.clearInput(); assert.equal(c.start(1.23, 100, 0), null);
  assert.equal(c.start(1.23, 0, 0, true), null);
  c.cancel(); assert.equal(c.nextStrike(1.24).id, 'side');
});
test('Wind-up and recovery have no active damage window; large frame steps preserve contact', () => {
  for (const s of STRIKES) {
    assert.equal(activeInterval(s, 0, s.windup), null);
    assert.equal(activeInterval(s, s.windup + s.active, strikeDuration(s)), null);
    assert.deepEqual(activeInterval(s, 0, strikeDuration(s)), [s.windup, s.windup + s.active]);
    for (const fps of [20, 30, 60, 120]) {
      const swing = createSwing(s, 0); let travel = 0, frames = 0;
      while (swing.elapsed < strikeDuration(s) && frames++ < 300) { const step = swingStep(swing, 1 / fps); travel += travelBetween(s, step.from, step.to); }
      assert.ok(Math.abs(travel - s.travel) < 1e-8);
    }
  }
});
test('Blade versus body capsules handles misses, crossings, parallel and degenerate segments', () => {
  const v = (x, y, z) => ({ x, y, z });
  assert.equal(bladeHitsCapsule(v(-1, 1, 2), v(1, 1, 2), 0, 2, .5, .3, 2), true);
  assert.equal(bladeHitsCapsule(v(-1, 4, 2), v(1, 4, 2), 0, 2, .5, .3, 2), false);
  assert.equal(bladeHitsCapsule(v(0, 0, 2), v(0, 3, 2), 0, 2, .5, .3, 2), true);
  assert.equal(bladeHitsCapsule(v(2, 0, 2), v(2, 3, 2), 0, 2, .5, .3, 2), false);
  assert.equal(bladeHitsCapsule(v(0, 1, 2), v(0, 1, 2), 0, 2, .5, .3, 2), true);
});
test('Four articulated trajectories are distinct, continuous, grounded and reach the front target', () => {
  const actor = knight(), untouched = knight(), base = new T.Vector3(), tip = new T.Vector3(), signatures = [];
  for (const strike of STRIKES) {
    let previous = null, hit = false, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i <= 160; i++) {
      const time = strikeDuration(strike) * i / 160;
      applyStrikePose(actor, strike, time); bladeSegment(actor, base, tip);
      assert.ok([...base.toArray(), ...tip.toArray()].every(Number.isFinite));
      if (previous) assert.ok(tip.distanceTo(previous) < .65, `${strike.id} pose jump`);
      if (i % 16 === 0) for (const leg of actor.legs) { const foot = new T.Box3().setFromObject(leg); assert.ok(foot.min.y > -.065 && foot.min.y < .065, `${strike.id} foot lost contact`); }
      previous = tip.clone();
      if (time >= strike.windup && time <= strike.windup + strike.active) {
        minY = Math.min(minY, tip.y); maxY = Math.max(maxY, tip.y);
        hit ||= bladeHitsCapsule(base, tip, 0, 2, .62, .35, 2.4);
      }
    }
    assert.ok(hit, `${strike.id} cannot reach a normal enemy in front`);
    signatures.push([minY, maxY]);
    assert.ok(actor.torso.quaternion.angleTo(new T.Quaternion()) < 1e-6);
    assert.equal(untouched.torso.rotation.y, 0);
  }
  assert.equal(new Set(signatures.map(s => s.map(n => n.toFixed(2)).join(','))).size, 4);
});
test('Every enemy strike reaches a player-height capsule at its approach distance', () => {
  for (const boss of [false, true]) {
    const actor = knight(true, boss), base = new T.Vector3(), tip = new T.Vector3();
    for (const strike of STRIKES) {
      let hit = false;
      for (let i = 0; i <= 120; i++) {
        applyStrikePose(actor, strike, strike.windup + strike.active * i / 120); bladeSegment(actor, base, tip);
        hit ||= bladeHitsCapsule(base, tip, 0, boss ? 3.65 : 2.1, .60, .4, 2.3);
      }
      assert.ok(hit, `${actor.group.name}: ${strike.id} always misses`);
    }
  }
});
test('Weapon trails reuse fixed buffers, fade, reset and dispose without lingering in the scene', () => {
  const scene = new T.Scene(), trail = new WeaponTrail(scene), geometry = trail.mesh.geometry;
  for (let i = 0; i < 50; i++) trail.sample(new T.Vector3(i, 1, 0), new T.Vector3(i, 2, 0), i / 100);
  trail.update(.5); assert.equal(trail.mesh.visible, true); assert.equal(trail.mesh.geometry, geometry);
  assert.equal(geometry.attributes.position.count, 24); assert.equal(geometry.drawRange.count, 66);
  trail.update(.8); assert.equal(trail.mesh.visible, false);
  trail.reset(); assert.equal(geometry.drawRange.count, 0);
  trail.dispose(); assert.equal(scene.children.length, 0);
});

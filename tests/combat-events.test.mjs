import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// GAME_ROOT permits a staged test to exercise the live module read-only.
const gameRoot = process.env.GAME_ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const dir = await mkdtemp(join(tmpdir(), 'ashen-event-tests-'));
after(() => rm(dir, { recursive: true, force: true }));
const out = join(dir, 'events.mjs');
await build({ entryPoints: [resolve(gameRoot, 'app/game/combat-events.ts')], outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
const { resolveContacts } = await import(pathToFileURL(out).href);

function actor(id, options = {}) {
  return { id, hp: 100, armor: 0, hero: id === 'hero', shielded: false, dead: false,
    phaseAt: () => 'idle', protectedAt: () => false, ...options };
}
function contact(attackerId, targetId, options = {}) {
  return { actionId: 1, attackerId, targetId, time: .1, damage: 12, stagger: .2,
    kind: 'melee', point: { x: 1, y: 2, z: 3 }, direction: { x: 0, z: 1 }, hits: new Set(), targetLimit: 1, ...options };
}
const combatants = (...actors) => new Map(actors.map(a => [a.id, a]));

test('Exact-time lethal trades admit both actors before either dies and latch death before reward callback', () => {
  const hero = actor('hero', { hp: 20 }), enemy = actor('enemy', { hp: 20 });
  const world = combatants(hero, enemy); let callbacks = 0;
  const events = resolveContacts([
    contact('enemy', 'hero', { actionId: 9, damage: 50 }),
    contact('hero', 'enemy', { actionId: 8, damage: 50 }),
  ], world, batch => {
    callbacks++;
    assert.deepEqual(new Set(batch.deaths), new Set(['hero', 'enemy']));
    assert.equal(hero.dead, true); assert.equal(enemy.dead, true);
    assert.equal(hero.hp, 0); assert.equal(enemy.hp, 0);
    // An integration reward hook must make this guard rather than revive the hero.
    if (!hero.dead) hero.hp = 100;
  });
  assert.equal(callbacks, 1);
  assert.deepEqual(events.map(e => [e.targetId, e.healthDelta, e.lethal]), [['enemy', 20, true], ['hero', 20, true]]);
  assert.equal(hero.hp, 0);
});

test('Earlier lethal contacts reject later source contacts without consuming their hit set', () => {
  const later = contact('enemy', 'hero', { actionId: 2, time: .11 });
  const world = combatants(actor('hero'), actor('enemy', { hp: 5 }));
  const events = resolveContacts([later, contact('hero', 'enemy', { damage: 5 })], world);
  assert.equal(events.length, 1); assert.equal(world.get('hero').hp, 100);
  assert.equal(later.hits.size, 0);
});

test('Windup interruption cancels later contacts but preserves a simultaneous trade', () => {
  for (const sourceTime of [.1, .11]) {
    const world = combatants(actor('hero', { phaseAt: () => 'windup' }), actor('enemy'));
    const events = resolveContacts([
      contact('hero', 'enemy', { actionId: 2, time: sourceTime }),
      contact('enemy', 'hero', { actionId: 1, time: .1 }),
    ], world);
    assert.equal(events[0].interrupted, true);
    assert.equal(world.get('enemy').hp, sourceTime === .1 ? 88 : 100);
  }
});

test('Interruption reads candidate-time phase: hero active continues, enemy windup stops, king resists', () => {
  for (const [id, phase, expected] of [['hero', 'windup', true], ['hero', 'active', false], ['hero', 'recovery', false], ['enemy', 'windup', true], ['enemy', 'active', false], ['king', 'windup', false]]) {
    const target = actor(id, { phaseAt: time => time < .2 ? phase : 'active' });
    const events = resolveContacts([contact('source', id)], combatants(actor('source'), target));
    assert.equal(events[0].interrupted, expected, `${id} in ${phase}`);
  }
  const events = resolveContacts([contact('source', 'enemy', { stagger: 0 })], combatants(actor('source'), actor('enemy')));
  assert.equal(events[0].interrupted, false);
});

test('Protection uses contact-time half-open boundary and consumes an evaded geometric contact', () => {
  const target = actor('hero', { protectedAt: time => time >= .05 && time < .30 });
  const world = combatants(actor('enemy'), target), hits = new Set();
  const events = resolveContacts([
    contact('enemy', 'hero', { actionId: 1, time: .05, hits }),
    contact('enemy', 'hero', { actionId: 1, time: .30, hits }),
    contact('enemy', 'hero', { actionId: 2, time: .30 }),
  ], world);
  assert.deepEqual(events.map(e => [e.outcome, e.healthDelta]), [['evaded', 0], ['damaged', 12]]);
  assert.equal(target.hp, 88); assert.equal(hits.has('hero'), true);
});

test('Shield rejection causes zero HP, interruption or death and cannot replay later in the action', () => {
  const target = actor('hero', { shielded: true, hp: 1, phaseAt: () => 'windup' });
  const world = combatants(actor('enemy'), target), hits = new Set();
  const first = resolveContacts([contact('enemy', 'hero', { hits })], world)[0];
  assert.deepEqual([first.outcome, first.healthDelta, first.interrupted, first.lethal], ['shielded', 0, false, false]);
  target.shielded = false;
  assert.deepEqual(resolveContacts([contact('enemy', 'hero', { time: .2, hits })], world), []);
  assert.equal(target.hp, 1);
});

test('Actual HP loss includes hero armor/minimum damage and clamps overkill, not the nominal hit', () => {
  const cases = [
    [actor('hero', { hp: 20, armor: 2 }), 50, 20],
    [actor('hero', { armor: 2 }), 10, 4],
    [actor('hero', { armor: 50 }), 1, 3],
    [actor('enemy', { armor: 50 }), 10, 10],
  ];
  for (const [target, damage, expected] of cases) {
    const events = resolveContacts([contact('source', target.id, { damage })], combatants(actor('source'), target));
    assert.equal(events[0].healthDelta, expected);
    assert.ok(target.hp >= 0);
  }
});

test('Several simultaneous attackers cannot overdraw HP or issue the same death twice', () => {
  const hero = actor('hero', { hp: 10 }); let deaths;
  const events = resolveContacts([
    contact('a', 'hero', { actionId: 2, damage: 20 }),
    contact('b', 'hero', { actionId: 1, damage: 20 }),
  ], combatants(hero, actor('a'), actor('b')), batch => { deaths = batch.deaths; });
  assert.equal(events.reduce((sum, e) => sum + e.healthDelta, 0), 10);
  assert.equal(events.filter(e => e.lethal).length, 1);
  assert.deepEqual(deaths, ['hero']);
});

test('Action hit sets deduplicate and enforce target cap in deterministic time/action/target order', () => {
  const hits = new Set(), world = combatants(actor('hero'), actor('a'), actor('b'));
  const events = resolveContacts([
    contact('hero', 'b', { hits }), contact('hero', 'a', { hits }), contact('hero', 'a', { hits }),
  ], world);
  assert.deepEqual(events.map(e => e.targetId), ['a']);
  assert.deepEqual([...hits], ['a']);
  assert.equal(world.get('b').hp, 100);
});

test('Absent source requires explicit permission, which does not authorize a dead source', () => {
  for (const [source, allowAbsentSource, count] of [[undefined, false, 0], [undefined, true, 1], [actor('source', { dead: true }), true, 0]]) {
    const world = combatants(actor('hero'), ...(source ? [source] : []));
    const events = resolveContacts([contact('source', 'hero', { kind: 'spell', allowAbsentSource })], world);
    assert.equal(events.length, count);
  }
});

test('Invalid or nonpositive candidate damage/time cannot mutate HP or hit sets', () => {
  const world = combatants(actor('hero'), actor('enemy'));
  const candidates = [0, -1, NaN, Infinity].map(damage => contact('enemy', 'hero', { damage }));
  candidates.push(contact('enemy', 'hero', { time: NaN }));
  assert.deepEqual(resolveContacts(candidates, world), []);
  assert.equal(world.get('hero').hp, 100);
  assert.ok(candidates.every(c => c.hits.size === 0));
});

test('Presentation event vectors are copied and cannot move the source contact', () => {
  const candidate = contact('hero', 'enemy');
  const [event] = resolveContacts([candidate], combatants(actor('hero'), actor('enemy')));
  event.point.x = 99; event.direction.z = -1;
  assert.equal(candidate.point.x, 1); assert.equal(candidate.direction.z, 1);
});

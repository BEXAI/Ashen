import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const root = process.env.GAME_ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const dir = await mkdtemp(join(tmpdir(), 'ashen-death-retirement-'));
after(() => rm(dir, { recursive: true, force: true }));
const out = join(dir, 'retirement.mjs');
await build({ stdin: { contents: 'export {GameEngine} from "./app/game/engine";export {RosterAssets} from "./app/game/roster-assets";export {createMechanics} from "./app/game/engine-mechanics";export {newProgress} from "./app/game/model";export {knight,animateActor} from "./app/game/world";export * as T from "three";', resolveDir: root }, outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { GameEngine, RosterAssets, createMechanics, newProgress, knight, animateActor, T } = await import(pathToFileURL(out).href);

test('Completed engine corpse releases fade ownership and the nearby roster model once; later renders never resample it', () => {
  const engine = Object.create(GameEngine.prototype), mechanics = createMechanics();
  const hero = { group: new T.Group() }, corpse = { group: new T.Group(), body: new T.Group() };
  let samples = 0, fadeDisposals = 0, visualDisposals = 0, invalidations = 0;
  const fade = { sample() { samples++; }, dispose() { fadeDisposals++; } };
  const texture = new T.Texture(), material = new T.MeshBasicMaterial({ map: texture }), geometry = new T.BoxGeometry();
  const decoded = new T.Group(); decoded.add(new T.Mesh(geometry, material)); corpse.group.add(decoded);
  corpse.visual = { dispose() { visualDisposals++; decoded.removeFromParent(); delete corpse.visual; } };
  Object.assign(engine, { mechanics, deathPresentations: new Map([['w1', fade]]), world: { hero },
    enemies: [{ id: 'w1', actor: corpse, dead: true }], combat: { swing: null }, dodgeTime: 0, reducedMotion: false });
  const entry = { actor: corpse, id: 'goblin', always: false, distance: 0, failed: false, loaded: { gltf: { scene: decoded, animations: [] }, tier: 'mobile' } };
  const roster = Object.create(RosterAssets.prototype);
  Object.assign(roster, { entries: [entry], status: { goblin: 'ready' }, sources: { goblin: { url: '/fixture.glb', sha256: 'fixture', tier: 'mobile' } },
    invalidate() { invalidations++; }, refresh: async () => {} });
  let geometries = 0, materials = 0, textures = 0;
  geometry.addEventListener('dispose', () => geometries++); material.addEventListener('dispose', () => materials++); texture.addEventListener('dispose', () => textures++);

  mechanics.deaths.set('w1', 4.54); engine.presentActors(1, .01); roster.update(hero.group.position);
  assert.equal(corpse.group.visible, true); assert.equal(corpse.group.userData.deathAge, 4.54);
  assert.equal(samples, 1); assert.ok(entry.loaded); assert.equal(visualDisposals, 0);

  mechanics.deaths.set('w1', 4.55); engine.presentActors(1, .01); roster.update(hero.group.position);
  assert.equal(corpse.group.visible, false); assert.equal(corpse.group.userData.deathAge, 4.55);
  assert.equal(engine.deathPresentations.has('w1'), false); assert.equal(fadeDisposals, 1);
  assert.equal(entry.loaded, undefined); assert.equal(roster.sources.goblin, undefined); assert.equal(roster.status.goblin, 'dormant');
  assert.equal(visualDisposals, 1); assert.deepEqual([geometries, materials, textures], [1, 1, 1]);
  for (let i = 0; i < 5; i++) { mechanics.deaths.set('w1', 5 + i); engine.presentActors(1, .1); roster.update(hero.group.position); }
  assert.equal(samples, 1); assert.equal(fadeDisposals, 1); assert.equal(visualDisposals, 1); assert.equal(invalidations, 1);
  assert.deepEqual([geometries, materials, textures], [1, 1, 1]);
});

test('Respawn removes the hero retirement marker so the living model remains eligible for streaming', () => {
  const engine = Object.create(GameEngine.prototype), mechanics = createMechanics(), hero = { group: new T.Group(), body: new T.Group() };
  const p = newProgress(); p.health = 0; p.won = true; p.defeated = ['king'];
  hero.group.visible = false; hero.group.userData.deathAge = 4.55; mechanics.deaths.set('hero', 4.55); mechanics.terminal = 'victory';
  let resets = 0, disposals = 0;
  Object.assign(engine, { p, mechanics, world: { hero }, enemies: [], deathPresentations: new Map([['hero', { reset() { resets++; }, dispose() { disposals++; } }]]), resetActions() {}, pause() {}, event() {}, emit() {} });
  engine.respawn();
  assert.equal(hero.group.userData.deathAge, undefined); assert.equal(hero.group.visible, true);
  assert.equal(mechanics.deaths.has('hero'), false); assert.equal(mechanics.terminal, null); assert.equal(resets, 1);
  assert.equal(disposals, 1); assert.equal(engine.deathPresentations.has('hero'), false);
  assert.equal(p.won, true); assert.deepEqual(p.defeated, ['king']); assert.ok(p.health > 0);
});

test('A fully retired procedural hero returns upright after the fade controller has been released', () => {
  const engine = Object.create(GameEngine.prototype), mechanics = createMechanics(), hero = knight(), p = newProgress();
  p.health = 0; mechanics.terminal = 'death'; mechanics.deaths.set('hero', 4.54);
  Object.assign(engine, { p, mechanics, world: { hero }, enemies: [], deathPresentations: new Map(), combat: { swing: null }, dodgeTime: 0,
    reducedMotion: false, resetActions() {}, pause() {}, event() {}, emit() {} });
  engine.presentActors(1, .01);
  assert.ok(Math.abs(hero.body.rotation.z) > 1, 'fixture must actually reach the procedural fallen pose');
  mechanics.deaths.set('hero', 4.55); engine.presentActors(1, .01);
  assert.equal(engine.deathPresentations.has('hero'), false); assert.equal(hero.group.visible, false);
  engine.respawn(); animateActor(hero, 0, 0, 0);
  assert.equal(hero.group.visible, true);
  assert.ok(Math.abs(hero.body.rotation.z) < 1e-9, `respawn retained death roll ${hero.body.rotation.z}`);
});

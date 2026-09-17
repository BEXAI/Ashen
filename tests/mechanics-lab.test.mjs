import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const stage = resolve(fileURLToPath(new URL('..', import.meta.url)));
const game = process.env.GAME_ROOT ?? stage;
const directory = await mkdtemp(join(tmpdir(), 'ashen-lab-tests-'));
after(() => rm(directory, { recursive: true, force: true }));
let serial = 0;
const isFile = path => ['', '.ts', '.tsx', '.js', '.css', '.json'].some(extension => existsSync(path + extension));
const findFile = path => ['', '.ts', '.tsx', '.js', '.css', '.json'].map(extension => path + extension).find(candidate => existsSync(candidate));
const resolver = {
  name: 'read-only-staged-imports',
  setup(build) {
    build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'test-navigation' }));
    build.onLoad({ filter: /.*/, namespace: 'test-navigation' }, () => ({ contents: 'export function notFound(){throw new Error("TEST_NOT_FOUND");}', loader: 'js' }));
    build.onResolve({ filter: /^\./ }, args => {
      const local = resolve(args.resolveDir, args.path);
      if (!local.startsWith(stage + '/') || isFile(local)) return;
      const counterpart = findFile(join(game, relative(stage, local)));
      return counterpart ? { path: counterpart } : undefined;
    });
  },
};
async function bundle(contents, dev) {
  const outfile = join(directory, `lab-${serial++}.mjs`);
  await build({ stdin: { contents, resolveDir: stage }, bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile,
    logLevel: 'silent', loader: { '.css': 'empty' }, plugins: [resolver], define: { 'import.meta.env.DEV': String(dev) } });
  return import(pathToFileURL(outfile).href);
}
const { MECHANICS_FIXTURES, createMechanicsFixture, shieldedBossFixture, WORLD, progressSchema, validDungeonSpawn, HERO_IDS, ENEMY_ROSTER, canOccupy, buildCollisionWorld } = await bundle(`
 export {MECHANICS_FIXTURES,createMechanicsFixture,shieldedBossFixture} from './app/game/MechanicsLab';
 export {WORLD,progressSchema} from ${JSON.stringify(join(game, 'app/game/model.ts'))};
 export {validDungeonSpawn} from ${JSON.stringify(join(game, 'app/game/dungeon.ts'))};
 export {HERO_IDS,ENEMY_ROSTER} from ${JSON.stringify(join(game, 'app/game/character-roster.ts'))};
 export {canOccupy,buildCollisionWorld} from ${JSON.stringify(join(game, 'app/game/kinematic.ts'))};
`, true);

test('All eight initial fixtures and six heroes produce schema-valid legal spawns with ordinary resources', () => {
  assert.equal(MECHANICS_FIXTURES.length, 8); assert.equal(HERO_IDS.length, 6);
  for (const fixture of MECHANICS_FIXTURES) for (const hero of HERO_IDS) {
    const p = createMechanicsFixture(fixture.id, hero);
    assert.equal(progressSchema.safeParse(p).success, true, `${fixture.id}/${hero}`);
    assert.equal(validDungeonSpawn(p), true, `${fixture.id}/${hero}`);
    assert.equal(p.hero, hero); assert.equal(p.health, 140); assert.equal(p.mana, 100);
    assert.equal(p.blade, 0); assert.equal(p.armor, 0); assert.equal(p.xp, 0); assert.equal(p.won, false);
  }
});

test('Duel and native crowd fixtures select only their advertised living actors', () => {
  const expected = { entry: Object.values(ENEMY_ROSTER), ogre: ['ogre'], goblin: ['goblin'], boss: ['ember-dragon'], 'boss-shielded': ['ember-dragon'], gate: [], throne: [], crowd: ['goblin', 'skeleton-warrior', 'shrouded-skeleton'] };
  for (const [fixture, roster] of Object.entries(expected)) {
    const p = createMechanicsFixture(fixture, HERO_IDS[0]);
    const alive = WORLD.enemies.filter(e => !p.defeated.includes(e.id)).map(e => ENEMY_ROSTER[e.id]);
    assert.deepEqual(alive, roster);
  }
});

test('Shielded boss uses only the disclosed post-start shrine replacement and preserves position/resources', () => {
  const before = createMechanicsFixture('boss-shielded', HERO_IDS[0]), after = shieldedBossFixture(before);
  assert.equal(before.shrines.length, 3); assert.deepEqual(after.shrines, ['cinder', 'dusk']);
  assert.deepEqual({ ...after, shrines: before.shrines }, before);
  assert.equal(validDungeonSpawn(before), true);
  // The gate intentionally closes BEHIND the hero; no collision geometry is entered.
  assert.equal(validDungeonSpawn(after), false);
  assert.equal(canOccupy(buildCollisionWorld(after), after.x, after.z, .45), true);
  assert.equal(after.checkpoint, 'dusk'); assert.equal(after.defeated.includes('king'), false);
});

test('Fixture reset creates isolated arrays and run IDs instead of sharing mutable progress', () => {
  const a = createMechanicsFixture('boss', HERO_IDS[0]), b = createMechanicsFixture('boss', HERO_IDS[0]);
  assert.notEqual(a.runId, b.runId); a.shrines.length = 0; a.defeated.length = 0; a.health = 0;
  assert.equal(b.shrines.length, 3); assert.equal(b.defeated.length, 9); assert.equal(b.health, 140);
});

test('Production route refuses the lab before creating its component', async () => {
  const page = await bundle('export {default as Page} from "./app/mechanics-lab/page";', false);
  assert.throws(() => page.Page(), /TEST_NOT_FOUND/);
});

test('Development route exposes the component; source has no save or benchmark invulnerability route', async () => {
  const page = await bundle('export {default as Page} from "./app/mechanics-lab/page";', true);
  assert.equal(typeof page.Page().type, 'function');
  const source = readFileSync(join(stage, 'app/game/MechanicsLab.tsx'), 'utf8');
  assert.equal(/localStorage|sessionStorage|\/api\/progress|\.benchmark\(|\.benchmarkState\(/.test(source), false);
  assert.ok(source.includes('game?.pause(true, true)'));
});

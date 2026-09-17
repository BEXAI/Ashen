import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

await mkdir('.sites-runtime/tests', { recursive: true });
const outfile = path.resolve('.sites-runtime/tests/touch.mjs');
await build({ entryPoints: ['app/game/touch-input.ts'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
const { PointerOwner, stickPosition } = await import(pathToFileURL(outfile).href);

test('Movement and combat keep independent fingers without stealing a gesture', () => {
  const movement = new PointerOwner(), combat = new PointerOwner();
  assert.equal(movement.start(11), true);
  assert.equal(combat.start(12), true);
  assert.equal(movement.start(12), false);
  assert.equal(movement.owns(12), false);
  assert.equal(combat.reset(), 12);
  assert.equal(movement.owns(11), true);
  assert.equal(movement.reset(), 11);
  assert.equal(movement.owns(11), false);
  assert.equal(movement.start(13), true);
});

test('A resting thumb stays still and partial deflection gives analog movement', () => {
  const resting = stickPosition(2, 2, 36);
  assert.equal(resting.x, 0);
  assert.equal(resting.y, 0);
  assert.equal(resting.sprint, false);
  const walking = stickPosition(18, 0, 36);
  assert.ok(walking.x > 0.4 && walking.x < 0.5);
  assert.equal(walking.y, 0);
  assert.equal(walking.sprint, false);
});

test('Dragging outside the pad stays bounded across portrait and landscape sizes', () => {
  for (const radius of [32.4, 33.6, 39.6]) {
    const out = stickPosition(-500, 500, radius);
    assert.ok(Math.abs(Math.hypot(out.x, out.y) - 1) < 1e-10);
    assert.ok(Math.abs(Math.hypot(out.thumbX, out.thumbY) - radius) < 1e-10);
    assert.equal(out.sprint, true);
    assert.ok(out.x < 0 && out.y > 0);
  }
  assert.deepEqual(stickPosition(20, 10, 0), { x: 0, y: 0, thumbX: 0, thumbY: 0, sprint: false });
});

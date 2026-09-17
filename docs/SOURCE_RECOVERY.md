# Source recovery and Higgsfield integration

Recovered on September 17, 2026 for BEXAI/Ashen.

## Baseline

The source baseline is Ashen Realm Sites version 7, commit
`3101c905c1ea1734dc266d34e37e4300b21bf343`. All 55 existing regression tests
passed after recovery. Searches of project files, prior chats, and connected
Drive found asset-only ZIPs, but no complete source ZIP. Version 7 was recovered
directly from its saved Git revision.

The previously published Sites version 12 points to
`e1e7bcd2c40544a6eb12686e3ce2b66750219646`. Its source could not be downloaded:
transfers returned HTTP 500. A version 11 transfer also encountered a malformed
Git protocol response. This recovery does not claim to contain changes from
versions 8–12. Do not overwrite that live release with this older baseline.

## Integrated assets

All three committed Ashen Realm Higgsfield 3D Jutsu scenes, revision 1, are
included. They supply the arch, pillar, trim, Ember Shrine and torch-sconce
models. The two Ashen character projects have no committed scene; unrelated
Ninjery projects are excluded.

- Runtime GLBs: `public/assets/higgsfield-jutsu/`.
- Unmodified Blender masters, source GLBs, and hashes: `assets-source/higgsfield-jutsu/`.
- Loader and room instancing: `app/game/higgsfield-environment.ts`.
- Actual room placements and fallback geometry: `app/game/world.ts`.
- Engine loading, redraw, light positioning, visibility and teardown: `app/game/engine.ts`.

Eight door arches, existing room pilasters and floor-edge trim, three shrines,
and ten wall sconces use the imported models. Source primitives are merged by
material and instanced per room. Distant room batches are hidden. Existing
collision geometry, gates, save format, interactions and combat remain authoritative.
Flame and light positions use the exported semantic anchors without importing
the source scenes' review lights or cameras. Failed downloads retain the
existing scenery, and late downloads are released after engine disposal.

The exports contain material parameters but no baked images of Blender's
procedural shading. No new character animation, texture baking, physical iPhone
performance measurement, or in-game screenshot is claimed.

## Validation

Run `npm run typecheck`, `node --test tests/*.test.mjs`, and `npm run build`.
The added asset tests parse the shipped GLBs, check actual world placements,
all 26,000 unique source triangles, finite instance bounds, material batching,
semantic fire/light anchors, fallback behavior, room visibility, and teardown
while loading. These CPU-side tests do not establish rendered device performance.

The original `.openai/hosting.json` preserves the existing Site identity.
GitHub source publication does not change the live Site. Reconcile with the
newer source before publishing this recovery back to that Site.

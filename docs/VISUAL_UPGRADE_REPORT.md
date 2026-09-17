# Ashen Realm visual-v8 implementation

Date: 2026-09-08. Baseline: deployed version 7, source
`3101c905c1ea1734dc266d34e37e4300b21bf343`.

The code, authored assets, room rollout and asset pipeline are implemented for
a saved review build. **The full premium visual overhaul remains incomplete.**
Characters are skeletal reconstructions, and rendered visual improvement has
not been verified. This report does not mark the entire JSON brief complete.

## Requirement coverage

| ID | Implemented | Remaining acceptance work |
| --- | --- | --- |
| R01 | Five fixed views, dev visual lab, main/whole-frame counters, frame percentiles, texture estimates | Equivalent rendered captures and device measurements |
| R02 | Three full-volume GLBs, independent rigs, LODs, source masters, Keeper reuse | Premium sculpt, retopology, organic weighting, high-detail baking, neutral-light and 360-degree art approval |
| R03 | Rig adapter; four phase-synchronized combat clips; locomotion, dodge, hit, death, cape motion; real sockets | Rendered slow-motion/deformation review; clips derive from existing procedural poses |
| R04 | Independent PBR fields, correct spaces/channels, baked tangents, retained masonry | Material/seam inspection and model-specific high-detail sculpt bakes |
| R05 | Crypt PMREM, room-blended fill, fixed torch pool, stable shadow key, UV1 indirect maps | Art tuning, captured probes/reflections and full GI bake; current lighting is approximate |
| R06 | Room batches, burial props, chains, banners, rubble and throne detail across five rooms | Rendered scale, seams, prop-clearance and composition review |
| R07 | Generated flame atlas, bounded impacts, capped rings, sampled trails, reduced-motion support | Overdraw profiling; dedicated smoke/dust/local-haze and impact-mark art remain deferred pending visibility review |
| R08 | Closer framing, wall-aware camera, stable exposure, tier-dependent effects | Moving-camera readability, AA and equivalent-resolution comparison |
| R09 | GLB/Meshopt/KTX2 build, local decoders, separate PNG fallback, hashes and masters | Real GPU transcoding and compression-quality review |
| R10 | Room chunks, staged loads/eviction, shared assets, serial quality swaps, cancellation/cleanup | Load stalls, decode peaks, full GPU cost and sustained traversal measurements |
| R11 | Structural, contact, fallback, lifetime, gameplay and mobile regression coverage | Rendered QA and 15-minute older/recent physical iPhone tests in both orientations |
| R12 | All archetypes/chambers wired, durable source/assets/docs, version-ready build | Art/device acceptance; this execution saves without deployment |

Parry, block, feints, new weapons, separate heavy input and foot IK remain the
brief's conditional mechanics backlog. Guest saves, economy, gates, checkpoints,
combat costs, iPhone controls and recovery remain the integration contract.

## Assets and resource accounting

Each archetype has three quality bundles, three mesh LODs and 13 clips. Nine
compressed GLBs and nine separate PNG fallbacks are shipped. One visible material
replaces the previous 27/32/31 mesh submissions per model, excluding extra passes
and effects. This is a structural comparison, not measured GPU performance.

| Mobile archetype | Compressed GLB bytes | PNG fallback bytes |
| --- | --- | --- |
| Ash Knight | 701,332 | 2,388,788 |
| Crypt Warden | 989,656 | 3,111,536 |
| Ember Sovereign | 802,380 | 2,674,848 |

All three mobile material sets would use about 16 MiB as RGBA8 with mipmaps.
This estimate excludes decoded images, geometry, simultaneous replacements,
PMREM, shadows, render targets and driver allocations. Hardware-compressed
residency depends on the selected transcode format. Target budgets remain
proposals until device measurements exist.

The old concept crops are no longer active maps. New fields encode pigment,
roughness, metalness, normal detail and localized emission independently. The
occlusion channel is neutral. Armor is largely rigid-weighted, with two cape
influences. These changes do not constitute premium sculpt/anatomy production.

## Rooms, lighting and effects

Five chambers and four passages contain 109,742 static triangles in 45 material
batches. These are asset totals, not one frame's visible workload. A separate
BVH retains collision; fallback geometry prevents holes during failed loads.

Each chunk has a 512-pixel indirect map and dedicated non-overlapping UV1 charts.
The CPU offline tool estimates first-bounce diffuse patch lighting with BVH
visibility from fixed torches. It excludes actors, moving gates and shrine
emission, and keeps irradiance separate from base color. This is not a
Cycles/full-GI bake. Small triangles have low texel density; art review is open.

The environment is a dark crypt PMREM with room-blended diffuse fill. A fixed
pool selects nearby torch lights. A directional shadow approximation occupies
an actual torch position, fades on source changes and reduces the matching point
light contribution. It is not a physical point-light shadow solution. Shrine
state is excluded from bakes to avoid stale colored illumination.

The generated 4-by-4 flame atlas runs at 12 frames per second, sampled inside
cell borders. Contact fragments share one 96-particle pool; transient rings are
capped at 12. Reduced-motion hides fragments and freezes fire animation.
Performance mode caps rendering at 30 Hz; Auto keeps adaptive output and its
60 Hz ceiling. These policies are not achieved frame-rate claims.

## Validation

`tests/visual-assets.test.mjs` checks every runtime/fallback hash and glTF,
universal KTX2 encoding, rig independence, all four weapon paths, enemy retiming,
LOD hysteresis, finite skin bounds, UV1 chart separation, texture coalescing,
particle capacity, real PNG-rig fallback, and room failure/cleanup. CPU rig
tests remove image sampling and cannot establish GPU material correctness.

Maximum sampled socket deviations from the baseline strike paths are below
0.00808 m (Knight), 0.00721 m (Warden), and 0.01454 m (boss), under the 0.04 m
regression threshold. Exact phase boundaries are included in animation keys.
Existing tests retain low/high-rate contact, progression, saves and mobile
runtime coverage.

The final save is gated on TypeScript, source/generated syntax, application
lint, all regressions, glTF/KTX checks and the supported production build.
`VISUAL_ASSET_VALIDATION.json` records exact results. Three pre-existing unused
imports in `tests/game.test.mjs` produce warnings when that older test is linted;
application source lint is separate.

Reviewed asset warnings:

- `NODE_SKINNED_MESH_NON_ROOT`: LOD meshes are children of an identity asset
  root. Tests cover the actual bone/socket and transformed skin hierarchy.
  Changing that internal root transform requires rebinding.
- The installed glTF validator has incomplete Meshopt/KTX2 extension support.
  Real Meshopt decoding and KTX tools checks supplement its MIME/extension
  warnings. Actual GPU transcoding remains pending.
- Unused UV1 notices are expected because runtime binds separate lightmaps.
  Unused accessor notices do not affect active clips.
- Missing tangent and zero-weight joint-index warnings were corrected.
- The encoder originally accepted an unrecognized compression name while
  emitting raw KTX2 data. It now uses `etc1s`, verifies encoding headers, and
  is protected by a regression check.

The supported cloud browser opened the visual lab but could not create a WebGL
context. The page reports this cleanly. No rendered comparison, frame-time
result, thermal/battery measurement or physical iPhone test was obtained.

## Remaining blockers and handoff

Higgsfield generated character references and a flame atlas. Its available
image endpoint rejected `image_to_3d`, requiring the unexposed `generate_3d`
action. No 3D job was submitted. Exact requests/results are preserved under
`assets-source/references/`. A supported 3D catalog lookup returned no suitable
model. The downloaded Blender binary failed even its version check, preventing
a manual sculpt or Cycles workflow in this environment.

The missing deliverable is a reviewed production sculpt, retopologized/UV-mapped
mesh, detailed material bake and deformation pass for each archetype. Replacement
assets can use the existing adapter, socket/clip names, LOD manifest and fallbacks.
Rerun numerical contact and browser/device review after replacement.

Source masters live under `assets-source/`; deployment assets are under `public/`.
Use `scripts/build-character-assets.mjs` with KTX Software 4.4.2 for characters
and `node scripts/bake-dungeon.mjs` for rooms. npm versions are locked. Decoder
licenses ship locally. The original execution brief is retained in this folder.

The dev-only `/visual-lab` uses a 960 by 540 CSS host, fixed views, progress
fixture and exposure. View/quality selectors and Animate, Freeze, Strike support
review. This route returns not-found in production.

The exact source is pushed, packaged and saved after checks. Saving does not
deploy. Live version 7 remains the rollback reference and this execution does
not change audience. Use the final Sites version record for the saved version
number and SHA; `visual-v8` is an asset version, not proof of a live deployment.

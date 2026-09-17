> Historical character pipeline notes. The September 8 roster is now active; the legacy Ash Knight remains the Keeper. The superseded v8 package was removed during the September 17 cleanup. Retained v9–v11 packages support rebuilding and regression tests. See `docs/ASSET_UPDATE_PLAN.md` for current integration priorities.

# Character assets: visual-v8

Ash Knight, Crypt Warden, and Ember Sovereign use skeletal GLBs with three mesh
LODs and one material per visible character. The Keeper shares the Knight.
Enemy IDs, boss identity, progression, damage, stamina and attack timings remain.

These are authored reconstructions of the existing full-volume models and
Higgsfield designs, **not new premium sculpts**. Anatomy, high-detail baking,
deformation and all-side visual inspection remain open art gates.

## Runtime contract

`app/game/character-assets.ts` shares template geometry/materials and clones
independent skeletons. The adapter samples side, diagonal, backhand and overhead
clips on the existing combat phase clock. Slower enemy phases map onto the same
contact path. `WeaponBase` and `WeaponTip` drive collision. Root movement and
wall collision stay in gameplay code. Other clips cover idle, forward/backward,
strafe, turn, dodge, hit and death. Knight/boss cape bones add modest motion.

| Archetype | LOD0 / LOD1 / LOD2 triangles | Bones | Maximum weights |
| --- | --- | --- | --- |
| Ash Knight | 9,320 / 5,126 / 4,372 | 15 | 2 |
| Crypt Warden | 15,652 / 8,608 / 5,678 | 13 | 1 |
| Ember Sovereign | 10,024 / 5,512 / 4,470 | 15 | 2 |

LOD selection uses projected height and hysteresis, retaining full detail inside
seven metres. All LODs remain resident in the template. These draw figures
exclude trails, rings, shadow passes and postprocessing.

## Materials and delivery

Atlases contain independent base color, tangent normal, ORM and emissive fields.
Color/emission use sRGB; normal/ORM use linear data. ORM is R=neutral occlusion
(1), G=roughness, B=metalness. Microstructure is analytic, not a high-to-low
sculpt bake. Tangents are generated per LOD with stable bases at collapsed UV
poles. Historical concept-crop textures are no longer requested by the renderer.

Low/mobile/high use 256/512/1024-pixel maps; Warden high stays 512. Each tier has
a Meshopt/KTX2 primary and separate PNG GLB fallback. ETC1S encodes color/emission;
UASTC with Zstandard encodes normal/ORM. Matching Three r180 Basis decoders are
local, with one transcoder worker. The build checks actual universal compression.

Loads and replacements run sequentially. Knight/Warden load first; boss prefetch
starts in the later chambers. A decoder failure uses the PNG bundle; a second
failure preserves the current presentation. Disposal aborts fetches, rejects
stale completions, frees instance skeletons and releases cache-owned resources.

## Authoring and provenance

- `assets-source/characters/`: editable uncompressed GLBs and PNG masters.
- `public/assets/characters/v9/manifest.json`: retained baseline hashes, sizes, bones, LODs and clips; the Keeper loader selects `public/assets/characters/v11/manifest.json`.
- `scripts/build-character-assets.mjs`: repeatable source-to-runtime pipeline.
- `assets-source/references/`: references, prompts, jobs, prepared 3D requests
  and the unavailable-action record.
- `public/assets/skins/provenance.json`: original design-sheet provenance.

Rebuild after installing locked npm dependencies:

```bash
ASHEN_TOKTX=/absolute/path/to/KTX-Software-4.4.2/bin/toktx node scripts/build-character-assets.mjs
node --test tests/visual-assets.test.mjs
```

Omitting `ASHEN_TOKTX` produces PNG-only development variants, which intentionally
fail the compressed release contract. Do not save them as a compressed release.

Higgsfield's image endpoint rejected `image_to_3d` and requested `generate_3d`,
which was not exposed. No 3D job was submitted. The rigs keep integration usable
while the sculpt/retopology/weighting pass is outstanding. See the visual report.

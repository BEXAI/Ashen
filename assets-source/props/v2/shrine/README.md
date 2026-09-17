# A02 Ember Shrine — reviewed asset package

Original carved stone shrine authored in Higgsfield 3D Jutsu, then baked from the actual committed Blender download. Production delivery is `ember-shrine.glb` with `ember-shrine-fallback.glb`. All work in this directory is independent of the Site checkout.

## Delivery and measured budgets

| Variant | Bytes | SHA-256 |
| --- | ---: | --- |
| `ember-shrine.glb` | 940,320 | `115c44ab0f78481a1c41441ed494055ab84d61b2cb2b49cebcd2e8049efb05a3` |
| `ember-shrine-fallback.glb` | 1,512,056 | `cda732bca2c650ccf3886015eee6d27e6ab6c0f2b453feffcb593b2e95d5c50f` |

| LOD | Body triangles | Ember triangles | Total | Draws when selected |
| --- | ---: | ---: | ---: | ---: |
| 0 | 5,492 | 444 | 5,936 / 6,000 | 2 |
| 1 | 2,592 | 352 | 2,944 / 3,000 | 2 |
| 2 | 942 | 192 | 1,134 / 1,200 | 2 |

Both variants contain all three LOD groups, six meshes, two shared materials, and four shared textures. Only one LOD group should be visible per shrine. Compressed format uses Meshopt geometry, ETC1S 1024² base color, UASTC 512² normal and ORM, and lossless neutral PNG 256² emissive. Complete KTX2 mip chains have 11/10/10 levels. PNG fallback uses the same Meshopt geometry and all four PNG textures. Estimated RGBA8 residency including complete mip chains is 8.333 MiB; actual GPU transcode allocation is device-dependent. The source base-color bake is 2048².

LOD0 world-space bounds are approximately 3.440 × 1.776 × 3.440 m. Maximum horizontal bounds across LODs are 3.462 m, below the 3.6 m footprint cap. Ground offset after quantization is within 1.4 mm. Source had 63 editable mesh objects and 8,128 evaluated triangles. Full exact decoded bounds, vertex counts, geometry hashes and texture differences are in `final-export-audit.json`.

## Runtime contract

`EmberShrine_Runtime` has identity translation, rotation and scale, glTF +Y up and metre units. It owns `EmberShrine_LOD0`, `EmberShrine_LOD1`, `EmberShrine_LOD2` groups, each with integer `extras.lod`. Each group contains `EmberShrine_LOD{n}_body` and `EmberShrine_LOD{n}_ember` meshes with `extras.lod_index` and `extras.surface_role`. Meshes intentionally do not repeat `extras.lod`.

Preserve the local node matrices introduced by geometry quantization. If instancing, multiply the placement matrix by each mesh's evaluated local-to-asset matrix. Do not replace these with identity based on the root pivot.

Anchors are direct root children: `Ground [0,0,0]`, `FlameOrigin [0,1.9,0]`, `LightOrigin [0,2.2,0]`, `EmberCore [0,1.54,0]`. Floating-point tolerance 1e-5 is sufficient. Place the asset at the existing shrine root `[s.x,0,s.z]` with scale one. Preserve existing shrine IDs, interaction radius, checkpoint offset, flame and light objects.

The body material `Shrine_BakedStoneIron` has `extras.surface_role='body'`, real base/normal/ORM textures, explicit tangent attributes and no emissive texture. `Shrine_StateEmber` has `extras.surface_role='ember'` and `extras.runtime_state_controlled=true`; its PNG is grayscale intensity, so runtime emissive color changes affect every channel without orange contamination. Default linear emissive factor is `[0.65,0.22,0.04]`, intensity one. Clone the ember material for each independently stateful shrine; share body geometry, textures and body material. Set the ember material's color and intensity for active/dormant transitions; intensity zero yields the neutral dark inset. Stone does not change. No flame sprites, lights, animation clips, collisions or interaction logic are included.

`manifest-entry.json` supplies the proposed `/assets/props/v2/manifest.json` `assets.shrine` entry. These URLs are integration targets, not a claim of deployed files.

## Source and reproducibility

- Editable original: `cloud-source.blend`; actual committed cloud preview: `cloud-source.glb`; remote preview image: `cloud-source-review.png`.
- Cloud project: https://higgsfield.ai/3d-jutsu/02f9af38-c881-4c8b-9fd6-0cbe6e8f1d59 — revision 1, sceneSequence 0. Operation `9ab62b77-22eb-4ed8-9ca4-738d995312f1` succeeded on the first authoring attempt. `cloud-operation.json` is the recorded terminal response.
- `author_shrine.py` is the exact original submitted source. `preflight.blend` was a local authoring check and is not the cloud source of record.
- `prepare_runtime.py` loads `cloud-source.blend`, recalculates outward normals, makes UV atlases and bakes selected-to-active base color, tangent normal, roughness, metalness and AO. Direct lighting is absent from base color; AO remains in a separate channel. Neutral emissive strength has its own map. `shrine-baked-workfile.blend` retains the editable baked derivative and packed images.
- `package_runtime.mjs` downsizes base color to 1024² and creates both variants. It restores the uncolored emissive-strength bake because Blender's exporter otherwise folds the orange material tint into the PNG. It then puts that tint in the editable glTF emissive factor. It decodes the actual encoded delivery to review GLBs.
- `validate_runtime.mjs` checks actual encoded geometry, transforms, shared materials, budgets, full mips, grayscale emissive, equal variant geometry and clean decoded validation.
- `render_runtime.py` reimports the real downloaded cloud GLB and both decoded delivered GLBs. Review lights/camera come from the source scene; the runtime asset contains none.

Run the four derivative stages sequentially using Blender Python, Node and the KTX tools. Example local commands:

```sh
/Users/nathaniel/Documents/ChatGPT/Knight/.tools/blender-venv/bin/python /tmp/ashen-shrine/prepare_runtime.py
node /tmp/ashen-shrine/package_runtime.mjs
node /tmp/ashen-shrine/validate_runtime.mjs
/Users/nathaniel/Documents/ChatGPT/Knight/.tools/blender-venv/bin/python /tmp/ashen-shrine/render_runtime.py
```

Scripts default to their own directory. Override `SHRINE_OUT`, `ASHEN_PACKAGE_JSON`, `ASHEN_TOKTX`, `ASHEN_KTX` when moving the package. Blender 5.2 and the game's installed glTF Transform, Meshoptimizer, Sharp and validator packages were used. `SHRINE_REUSE_BAKES=1` is only appropriate for export-only changes with unchanged source geometry/UVs. Rerun hashes and validation after every derivative change.

## Review evidence

Visually reviewed `cloud-source-review.png`, `cloud-glb-review.png`, `baked-lod0-review.png`, `fallback-lod0-review.png`, all three `compressed-lod*-review.png`, `compressed-cyan-review.png` and `compressed-off-review.png`. Portable bake preserves the stone/iron distinction that procedural source GLB materials cannot carry. LOD0 and LOD1 preserve the layered silhouette; LOD2 is visibly faceted at close range and intended for distant selection. Cyan and off-state renders confirm the state channel is separate from stone. No runtime flame/light was added.

Validator: zero errors on both encoded files; PNG variant has zero warnings. Encoded KTX2 reports six warnings from the validator's unsupported image format, and unsupported-extension infos. Actual Meshopt-decoded/KTX2-transcoded review variants both have zero errors and zero warnings. Normal/ORM/base color mean absolute differences from PNG are 0.230/0.342/1.362 out of 255; emissive is bit-identical. `final-export-audit.json` preserves exact values.

The connector exposes neither the advertised `query_python` nor `show_scene` tool in this session. This package records actual cloud operation output, downloaded source render, and actual-export reimport renders instead; it does not claim those unavailable tools were run. Browser/game/mobile integration QA remains the integrating task's responsibility.

## Credits and provenance

Selected private owned workspace: `bdeb1056-93d9-4c2d-8b80-389d588bab2f`. Balance before project creation, after creation/before authoring, and after authoring: 4,113.5. Observed A02 debit: zero. This is an observed balance delta, not a promise of free service. One of the permitted two authoring attempts was used. No source imports, third-party catalog meshes, external textures, or reference IP were used. Source was original assistant-authored Blender code in the user's project.

The session has a shared authorization ceiling of 1,000 credits; this asset's observed debit consumes zero of that ceiling. A02 released the cloud mutation slot to A03 only after terminal state and a fresh balance checkpoint. The total budget still applies to subsequent jobs.

Higgsfield's [Terms of Use §4.4](https://higgsfield.ai/terms-of-use-agreement), checked 2026-09-09, say Higgsfield does not claim ownership of inputs/outputs or restrict commercial use of outputs; exported rights survive cancellation. This is also explained in its [ownership help page](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially). The terms do not guarantee uniqueness or exclusive copyright. `production-ledger.json` records source receipt metadata, credit checkpoints, rights sources and hashes; `SHA256SUMS.json` inventories this package.

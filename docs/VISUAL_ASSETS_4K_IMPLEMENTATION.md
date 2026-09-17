# Visual asset update — 8 September 2026

The v9 visual asset pass implements `VISUAL_ASSETS_4K_UPDATE.json` on the audited v8 source. It adds detailed materials, geometry, lighting assets and effects while preserving combat, input, progression, collision and saves. This report separates implemented work from unverified visual quality.

| Package | Implementation and evidence |
| --- | --- |
| V01 Character surfaces | Three Higgsfield 4096×4096 diffuse material images; unique xatlas UV charts; 4096px master atlases; 32-ray geometric occlusion; independent normal/roughness/metalness fields; MikkTSpace tangents. Added plate bevels, rivets, curved ribs and cloth folds. |
| V02 Dungeon detail | Distinct threshold borders, iron crypt reliefs, ossuary skull reliefs, chapel tracery and throne crown ornament; restrained vertex tint. Existing five rooms and four passages, collision architecture and interaction positions remain intact. |
| V03 Lighting | Continuous UV1 charts; 1024px room and 256px passage irradiance maps; fixed-torch patch lighting and 24-ray contact visibility; authored directional diffuse probe coefficients. Runtime lightmap UVs retain Float32 precision. |
| V04 Effects | Adjacent flame frames crossfade within a single material draw; atlas insets exclude borders and mipmapping is disabled to prevent frame bleed. Contact fragments have soft circular edges, shrinking size and fading opacity in the existing fixed pool. |
| V05 Quality variants | Low, mobile, desktop HD and Ultra variants; ETC1S color/emission and UASTC normal/ORM mip chains; PNG fallback maps capped at 1024px; unsupported texture compression caps character assets before a large RGBA allocation. |
| V06 Verification | 55 gameplay/mobile tests, 15 asset tests and two storage integrity tests pass. Typecheck, source lint, production build and syntax checks (43 source files, 19 compiled modules) pass. All 48 compressed texture payloads pass `ktx2check`; character and room glTF structure checks pass. Evidence is recorded in `VISUAL_V9_VALIDATION.json`. |

Character LOD triangle counts are Knight 21,384 / 11,760 / 8,420; Warden 31,572 / 17,364 / 8,524; Sovereign 22,552 / 12,402 / 8,938. Each LOD retains one material draw and the existing 13 clips. The characters use 13–15 bones. Maximum tested weapon-socket deviations from the existing combat trajectories are 0.008073m, 0.007200m and 0.014530m respectively, below the 0.04m limit. No attack timing or reach constants changed.

The glTF validator reports no structural errors. Its three `NODE_SKINNED_MESH_NON_ROOT` warnings per character correspond to LOD meshes below an identity asset root, as in the previous asset structure. Independent skeleton, world-bound and weapon-path tests cover their use by the current Three.js adapter. Unused authoring accessors are informational notices.

The five main rooms now use 1,011–1,599 UV charts instead of roughly 20,000–24,000 separate triangle charts. All nine compressed room exports pass the test for overlapping chart interiors at their shipped map resolution. Compression originally introduced five overlapping pixels in the entrance; preserving UV1 as Float32 removed the error without relaxing the test. The six-pixel xatlas packing margin becomes approximately 4–5 pixels at the shipped dimensions; manifests record the exact margin.

The character-only worst-case RGBA8 mip estimates total 6.25 MiB in Low, 25 MiB on mobile, 100 MiB in desktop HD and 228 MiB for all Ultra characters. These are allocation estimates, not measured GPU memory or total game memory. On hardware with block compression the actual payload is substantially smaller. GPUs without supported block compression use the mobile asset tier even when 4K output is selected. Existing stone textures, render targets, geometry and old/new replacement overlap must be counted separately when profiling. Each mobile character is approximately 1.9–2.0 MB to download in its compressed variant.

Seven protected source files are byte-identical to the audited baseline, enforced by a regression test: combat, progression model, dungeon layout, touch controls, mobile CSS, mobile runtime and the progress API. Engine and camera source were not changed. The existing real 3840×2160 Ultra output and adaptive iPhone Auto behavior remain available.

## Production and visual limits

The source and runtime integration are implemented. Full rendered 360-degree inspection, GPU shader compilation, comparison screenshots and physical iPhone performance remain unverified because the available browser reports WebGL as disabled. Texture images and master layouts were inspected; those inspections are not substitutes for a rendered game frame.

These characters remain detailed authored reconstructions of the Higgsfield designs, with rigid-weighted armor regions. They are not completed premium anatomical sculpts. The earlier brief's premium sculpt, deformation and all-side art approval gates remain open. The dungeon bake is an offline patch approximation, not path-traced global illumination. Directional ambient coefficients are authored rather than captured probes. No claim of Unreal Engine, Lumen, Nanite or hardware ray tracing is made.

Higgsfield accepted the requested `nano_banana_pro` model but reported `nano_banana_2` in completed job metadata. All three files are genuinely 4096×4096. Generated imagery contains some local tonal shading; it is artistic diffuse detail, not a measured PBR scan. Perfect edge tiling is not certified. Original requests, completed job data and image hashes are retained in `assets-source/materials/`.

The update is prepared as a saved review version. Publishing and site visibility are separate from implementation.

## Rebuilding the assets

Install the locked dependencies. The offline-only `watlas@1.0.1` dependency provides xatlas unwrapping; no additional runtime dependency was added. Supply KTX Software 4.4.2's `toktx` through `ASHEN_TOKTX`, then run `node scripts/build-character-assets.mjs`. Run `node scripts/bake-dungeon.mjs` to rebuild room geometry and lighting. The room-only `--repack-only` option recompresses existing room masters without repeating the lighting bake.

Full-resolution character sources use editable `.gltf` documents with `.bin` geometry and external 4096px PNG maps. Companion source `.glb` files carry 512px previews; runtime GLBs still use their declared quality variants. Keeping master maps external removes duplicate bytes without discarding the 4K artwork.

Large binary files are stored as verified three-MiB blocks in `assets-source/blocks`. `npm run build` automatically restores their exact bytes before compiling; run `node scripts/restore-visual-assets.mjs` before opening a freshly cloned art master or running tests. SHA-256 checks protect both blocks and reconstructed files. Local artist edits are never silently overwritten. After intentionally editing an unpacked large asset, run `node scripts/pack-visual-assets.mjs` to update its tracked blocks and manifest. This representation addresses the source transfer limit and does not change runtime asset bytes or resolution.

Run `npx tsc --noEmit`, application/source lint, `node scripts/check-syntax.mjs`, the gameplay and asset test suites, then the Sites production build. Manifests under `public/assets/characters/v9` and `public/assets/dungeon/v9` record all runtime paths, dimensions, sizes and hashes. The development-only `/visual-lab` route provides fixed scene views and diagnostics for the outstanding supported-GPU review.

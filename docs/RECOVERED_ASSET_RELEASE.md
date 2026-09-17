# Recovered Higgsfield asset integration — September 17, 2026

All fourteen recovered character meshes and the Bone Throne are integrated and validated. The final pushed source SHA, saved Site version, archive hash and terminal deployment result are recorded in the publication receipt outside the checkout.

## Scope

The fourteen recovered September 9 character GLBs replace the matching existing appearances. They retain the same six hero choices, ten enemy/save IDs, progression gates and original September 8 artwork identities. Golem and Shrouded Dead keep their existing models because the audit found no additional mesh for them. The original sixteen portraits, Crown film, fifteen-item Artwork gallery, landing artwork and link preview remain available.

The recovered originals are preserved under `assets-source/higgsfield/recovered-2026-09-17/models`, with provider job receipts and SHA-256 identity in `inventory.json`. They total 60,956,536 bytes. The empty `higgsfield 2` directory was not a source. Generation date, recovery date and runtime content version are recorded separately; these were missing alternatives, not fourteen newly generated characters.

## Character delivery

Every replacement uses a weighted skeleton and twelve named gameplay clips, with versioned mobile/HD URLs under `/assets/roster/recovered-2026-09-17/`. Body grounding curves, real weapon contacts and source-specific equipment policies are stored in the versioned active roster manifest. The prior manifest URL remains a current alias for compatible clients. The four blade heroes retain game-authored held blades; recovered staff, bow, club, cleaver, scythe, sword and shield geometry is used where present. Sage uses the left-hand staff; Frost Necromancer and Lich use their right hands.

Humanoid motion is adapted from the preserved Higgsfield motion library. The spider has a locally authored fifty-joint eight-leg rig and twelve fitted clips. Its mobile derivative has 24,005 triangles; HD retains all 57,158 source triangles. Original mesh and texture streams remain preserved in the source archive. Texture caps are 1,024 pixels on mobile and 2,048 on HD; Performance mode retains the existing 512-pixel pre-upload cap. HD source JPEG streams are retained where possible to avoid inflating compressed source images into lossless raster encodings.

These are practical browser-game rigs, with simplified hands, fitted cloth weights and rigid wing/tail frames. The dragon does not have independent wing-flapping clips. Small raised-arm/cape overlaps remain in the Ranger’s draw pose. Model validation and desktop asset renders do not establish physical iPhone frame pacing, memory use, thermal stability or touch comfort.

## Bone Throne

The September 17 revision-1 prop comes from Higgsfield project `02765069-6a15-4d44-852b-025f53032fdf`. Its original GLB and editable Blender file, exact hashes, catalog identity and normalization recipe are in `assets-source/higgsfield/2026-09-17/bone-throne`. The available receipts do not contain license terms; provenance does not label this catalog mesh as original-authored or CC0.

The prop is a side relic in the Hollow Throne chamber at **[-11, 0, -77]**, facing the entrance, scaled to approximately **1.276 × 2.515 × 1.392 m**. The existing central throne is part of the baked room and remains in place. The new relic clears the boss, chest and main route.

The compressed model is 186,636 bytes; its core-glTF fallback is 376,720 bytes. Both retain 6,120 triangles and the original vertex colors, with one material/draw and no textures or lights. A dedicated v3 manifest avoids changing the existing three v2 prop contracts. Streaming loads it within 44 m, retains it until 60 m, and disposes its resources on release. Failed downloads leave a small visible chair placeholder with the same collision footprint; later approaches retry failed manifest requests.

The `bone_throne` graphics-check view provides a repeatable in-game inspection. The expanded XZ footprint blocks hero and enemy movement, including fast axis sweeps. A matching 3D proxy blocks camera and combat rays. Visible throne costs are included in diagnostics and deducted before allocating the remaining architecture budget. The combined cap stays at ten draws and 25,000 triangles. Build pruning follows both v3 delivery URLs and preserves their dependency closure.

## Rollback and reproduction

The previous runtime manifest and exact Site/GitHub revisions are preserved in `previous-runtime-manifest.json` and `rollback.json`. Original September 8 source meshes, motion donors and authored variants remain preserved. Superseded public delivery files are omitted from the new release to stay within the hosting archive cap; their exact previous bytes remain recoverable from the recorded Git revisions. Reload an already-open game tab after publication: an older running bundle retains its previous manifest in memory and can otherwise fall back when it requests a retired model URL. Saved progression remains in the existing save service.

Use the archived preparation recipes to rebuild reviewed derivatives. `scripts/import-recovered-roster.mjs` checks source identity, variant hashes, validation status and equipment policies before updating selected manifest entries. `scripts/pack-roster-assets.mjs` merges the recovered source/runtime families into the existing lossless chunk store. `npm run prebuild` restores packed files and refuses to overwrite differing local artist edits.

## Acceptance

Local browser smoke checks loaded the compressed Bone Throne and roster models successfully in the throne and boss views. The throne reported one draw and 6,120 triangles; combined visible props in the boss view reported five draws and 7,616 triangles, within the existing cap. This was headless desktop Chromium using a software renderer, not phone performance evidence.

All fourteen mobile deliveries passed independent, hash-bound pose review. The 28 recovered mobile/HD variants total **115,870,284 bytes (110.50 MiB)**, each with zero glTF validation errors. The complete regression suite passed **210/210 tests**, including source identity, real melee contacts, equipment/muzzles, saves, controls, streaming, throne collision and fallback handling. TypeScript, scoped lint, syntax checks for 94 source files and 19 compiled modules, and the production build passed. The archived preparation recipes also passed syntax checks, and the 33-step offline rebuild plan resolves its recipe files.

[Acceptance details](recovered-assets/acceptance.json) and [browser evidence](recovered-assets/recovered-browser-qa.json) bind the reviewed assets. Source originals, original hashes, required rig inputs and recipes remain archived. The new release retires 29 unreferenced byte blocks (79,328,736 bytes) and the superseded public character variants; no source original was removed. Publication uses the exact committed, pushed source and its packaged production output.

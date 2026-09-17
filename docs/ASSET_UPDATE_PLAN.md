# Ashen asset update plan

Audited September 17, 2026. This is an implementation plan; the asset audit and obsolete-file cleanup do not activate new encounters or replace current artwork.

## Findings

The specific `Ashen/assets-source/higgsfield 2/` directory is empty, including hidden entries. It contains no updated meshes. Before removing synthetic test outputs, comparing the canonical `assets-source/higgsfield` folders in the GitHub and current Site checkouts found 226 shared logical files with identical SHA-256 hashes, including all 41 source GLBs. Large files were compared through their tracked reconstruction blocks as necessary.

The additional 17 files in the GitHub checkout are the September 17 import receipt and 15 original image/video assets. Their generation dates are September 7–9; September 17 is the import date. All 15 already have optimized derivatives in Journal → Artwork. These images are not additional rigged characters.

The cloud audit found **14 completed character GLBs absent from the audited project/source trees**. They were generated September 9, before the currently integrated reconstructions, so they are missing alternatives rather than proven newer or better models. They map to frost mage, dusk rogue, ember dragon, lion knight, ogre, ranger, sage, silver knight, lich, reaper, spider, goblin, skeleton warrior and knife rogue. All fourteen result URLs returned HTTP 200 with a GLB content type, totaling 60,956,536 bytes. The audited official-CLI list returned 75 jobs for a requested 100; it is not an independently proven exhaustive account history. Fourteen current Meshy originals and fifteen animation donors were separately matched to preserved sources and runtime build receipts.

**Prioritize ogre and goblin.** Their current versions are locally authored, whereas these recovered provider outputs contain embedded textures. Full downloads confirm 56,716 triangles / 2,784,968 bytes for ogre and 57,286 triangles / 2,575,956 bytes for goblin. Each has one mesh, one material and three embedded images, but no skin or animations. Visual superiority has not been established. Exact jobs, source-image mappings, output hashes and availability checks are recorded in `docs/ASSET_AUDIT_2026-09-17.json`.

One newer missing 3D asset is confirmed in Higgsfield: **Bone Throne**, in [Ashen Realm — crypt relics and ossuary props](https://higgsfield.ai/3d-jutsu/02765069-6a15-4d44-852b-025f53032fdf), revision 1, created September 17. No matching source object or project reference was found in either current checkout. The remote scene contains one mesh, `dun_bone_throne`, with 6,120 triangles, 9,296 vertices and approximate Blender dimensions of 0.88 × 0.9601 × 1.7347 metres. It is a static prop with one material, no embedded textures, no armature and no animation. Its 376,016-byte GLB has SHA-256 `5055af6df7d4dbcb64ae4a631d311da019a7f94cc8991c064a6cda73f2793857`.

| Asset group | Current state | Next action |
| --- | --- | --- |
| September 8 screenshot roster | All 16 characters registered; six playable heroes and ten enemies; 32 mobile/HD GLBs | Retain current roster and test any future replacements individually |
| Fourteen recovered September 9 character GLBs | Completed remote originals not imported; all download endpoints available | Compare ogre/goblin first, then remaining twelve alternatives |
| Bone Throne | New remote static mesh; absent from project/runtime | First static-prop integration candidate |
| Torch sconce, Ember Shrine, arch/pillar/trim kit | All active; remote committed revisions remain 1 | No duplicate import needed |
| Dungeon rooms and lightmaps | Latest selected geometry and lightmaps active; earlier version references are intentional dependencies | Preserve mixed-version manifest closure |
| Refined Ember Sovereign v11 | Preserved rigged source and regression assets; current final enemy is the dragon | Optional additional encounter or boss appearance, not a missing updated import |
| Crypt Warden v9 | Preserved legacy source; not a current encounter | Optional crypt elite if desired |
| Ash Knight photoreal study | Higher-detail image in Artwork; legacy Ash Knight is the Keeper | Visual refinement reference, not a ready mesh replacement |
| Flame atlas and steel albedo | Atlas is live; steel is baked into the Keeper | Already integrated |
| Warden hide and Sovereign obsidian fields | Used by preserved legacy models | Reuse if those models return; do not overwrite unrelated roster UV maps |
| Sovereign key art and concept trailer | Accessible in Artwork | Keep there; optional boss illustration later |

## Update 1 — recover and evaluate missing character meshes

1. Import the fourteen existing outputs as source assets with provider receipts and hashes; do not create replacement generation jobs. Keep them outside `public/` until optimized and accepted. Preserve current actors as a working baseline.
2. Review ogre and goblin from front, side and back alongside their screenshot references and current models. Check hands, mouth, weapon geometry, material channels and disconnected parts. Their approximately 57K triangles require mobile-budget review; file size alone does not establish suitability.
3. For accepted models, repair topology where needed, prepare retopology/LODs, normalize height and floor origin, and rig them using the current roster's named bones and weapon attachments. Retarget all twelve gameplay clips and validate skin weights, body-only grounding and every strike contact. Do not treat the static GLBs as drop-in playable characters.
4. Export the existing mobile/HD contract, retain the authored versions for rollback, update only the ogre/goblin manifest entries and provenance, and run model validation plus combat/streaming regression checks. Review actual device performance before switching the default.
5. Compare the remaining twelve provider originals against the working Meshy reconstructions. Adopt only a demonstrable improvement in reference likeness, deformation or mobile cost. Keep the source alternatives even when the current model wins; availability does not justify replacing all twelve automatically.

Completion means any adopted replacement preserves the existing character identity, encounter role, actions and collision/contact behavior. Retrieval and comparison can finish independently of art approval or rigging.

## Update 2 — integrate the Bone Throne

1. **Capture a reproducible source.** Retrieve the exact revision-1 GLB and editable Blender file into a dedicated `assets-source/props/v3/bone-throne/` folder. Record provider project/revision, catalog reference, sizes, hashes and transformations. The export identifies catalog asset `65b31468-5c24-440c-9a95-99db1b195b67`; a current name search returned a different catalog ID, so resolve the source identity and applicable reuse terms before shipping it. The metadata returned during this audit did not include a redistribution license.
2. **Prepare the mesh.** Remove the source scene's −6 m X offset, normalize the floor origin and orientation, and inspect the seat, back and underside. The child has a −0.867351 m Y translation in the GLB; validate world-space bounds rather than applying arbitrary offsets. Check normals and silhouette under the actual dungeon lights. Author or bake bone/aged-metal material detail only if the untextured export needs it. Preserve the untouched original separately.
3. **Package one prop.** Produce a compressed runtime GLB and a working fallback using the existing prop pipeline. Retain the 6,120-triangle mesh unless device measurements justify a reduced mobile variant. Keep the prop to one or two draws and no more than 1K mobile textures. Record real output sizes and hashes in a new props manifest that also carries forward the existing sconce, shrine and architecture entries.
4. **Place it in the throne chamber.** Use one decorative instance against a wall or on the existing dais. Keep the dragon, spawn positions, escape route, shrine interactions and combat floor clear. Add only a simple collision proxy if the final placement is reachable; do not create a new boss or quest merely to display the prop.
5. **Integrate lifecycle and build inclusion.** Extend the manifest-backed prop loading path or add a small dedicated loader. Support asset failure without blocking gameplay, dispose owned resources, and ensure the build-pruning dependency scan includes both compressed and fallback URLs. Update the provenance ledger and third-party notice for the verified source.
6. **Accept and release.** Validate GLB structure, hashes, placement/collision clearance, fallback behavior, room re-entry and disposal. Run typecheck, syntax check, the regression suite and production build. Review desktop plus iPhone portrait/landscape behavior and measure memory/frame pacing on a physical device before claiming mobile performance. Commit, push, publish and smoke-check the exact release.

Completion means the throne is visibly present during ordinary play, cannot obstruct progression, survives quality changes/re-entry and requires no separate debug page to find.

## Update 3 — optional character reuse and refinement

After the missing prop is integrated, evaluate whether the preserved Warden and refined Sovereign deserve additional encounters. Keep all sixteen screenshot characters and the current dragon encounter available. A Warden elite is the smaller addition; a Sovereign encounter needs an explicit design for when it appears and how progress is saved.

For either character, preserve the tested weapon sockets, contact windows, animation timing and scale. The legacy characters use a different rig/clip pipeline from the September 8 roster, so they cannot be added by copying a GLB filename into the roster. Update actor registration, encounter selection, loader readiness and production pruning together, then verify body grounding, strike contacts, deaths, quality changes and cached resource disposal. Use the existing validated mobile/HD variants first.

Use the photoreal portrait studies only as references for a deliberate mesh/material refinement pass. They require modeling or reconstruction, retopology, UVs, weights, animation validation and optimized exports. They are not evidence that newer 3D models already exist. Preserve the current homepage background and link-preview artwork.

The separate `mobile-upgrade/walls` folder also contains four unintegrated September 8 masonry modules: straight wall, inside corner, arch doorway and torch bay. These are not proven newer than the current architecture. Review one entry-room prototype first; the 1.56 m doorway width and 2.55 m height need character/camera clearance checks, and the combined export has overlapping module origins. The `realism-v2` Knight/Warden studies are static and unrigged; preserve them as optional art sources rather than counting them as finished gameplay replacements. Keep the unfinished Sovereign/blockout studies and original source ZIPs until their unique source content has been deliberately consolidated.

## Pipeline preparation

- Make rebuild scripts resolve vendored source paths rather than absolute `/Knight/references` paths before removing any external authoring folders.
- Consolidate asset-packing behavior: the legacy visual packer rebuilds only its old roots, whereas the roster packer merges its roots. A future combined packer must preserve every managed source family and verify restoration hashes before deleting orphan blocks.
- Keep originals, donors, refined meshes and regression baselines. Remove generated historical packages only after checking runtime, tests, rebuild recipes, retained manifests and shared packed blocks.
- Track generated date, imported date, source revision/hash, runtime derivative/hash and activation status separately. A folder timestamp or higher version number is not enough to decide that an asset is new or obsolete.

## Release budget

The published game was approximately 244 MiB expanded before cleanup, against the current 256 MiB package limit. The deleted v8 character/room assets were already pruned from deployment, so their removal mainly reduces the source checkout. The five unused terrain/sky originals also reduce deployment size by about 4.46 MiB. Measure the final package after adding the throne; never ship full-resolution reference PNGs or unoptimized authoring meshes in `public/` merely to make them available to developers.

The audit's cleanup passed all 204 current tests, typecheck, syntax check and production build. Those results validate cleanup, not the proposed throne integration or physical-device performance.

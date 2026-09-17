# Sovereign shoulder and cape refinement

The reviewed candidate is `ember-sovereign-rigged-master.glb`. It contains the original 15-joint rig, 13 clips, weapon geometry, sockets and eight texture images. Shoulder underarmor now blends continuously into the upper arm; each upper pauldron plate and its matching trim use uniform torso/arm influences. The lower cape gains a bounded 20 cm rest-space setback. Only `dodge/cape_lower/rotation` changes: the original quaternion is multiplied by a local-X rotation of `0.18 * sin(pi * t / duration)^2` radians. All other 389 animation channels, every input timeline, all joint rest transforms and inverse binds are byte-exact relative to the prior v10 master.

## Rebuild

Requires the existing game dependencies (`@gltf-transform`, `meshoptimizer`, `three`, `three-mesh-bvh`, `gltf-validator`) and bpy 5.2.1. Paths are configurable. This writes only into the explicit output directory outside the game checkout.

Run from the game directory after restoring packed source assets:

```sh
python3 assets-source/sovereign-v11/scripts/rebuild_refinement.py \
  --game "$PWD" \
  --python-bpy ../.tools/blender-venv/bin/python \
  --source-dir assets-source/sovereign-v11 \
  --out /tmp/ashen-refinement-rebuild \
  --render
```

Replace `--python-bpy` with your bpy 5.2.1 Python environment when rebuilding elsewhere. This command is an updated path recipe; documentation reconciliation did not perform a full character re-export.

If integrating the candidate over the previous source master, preserve the old master separately and pass `--baseline /path/to/previous-v10-master.glb`. The baseline hash is `f3f66e881e656b14e4683de653143c7663b1af65e88b13244870a8266c122516`. `--rig-source` can likewise point to a preserved original legacy rig. Input hashes are in `handoff-summary.json`.

The wrapper runs these stages in order:

1. `rig_refined_sovereign.mjs` transforms the annotated static atlas, assigns semantic weights, applies the cape correction, and builds near/middle LODs. Defaults are explicitly fixed to 0.20 m rest setback and 0.18 rad dodge correction.
2. `reduce_far_lod.py` imports the actual master and collapses LOD0 with ratio 0.33.
3. `graft_far_lod.mjs` grafts only the reduced body geometry into LOD2, remaps bones by name, reuses the original material/weapon and repairs degenerate tangents. It retains the master skeleton and animation bytes.
4. `verify_refinement.mjs` verifies the exact intentional channel exception, all preserved tracks, textures, weapon geometry, original rig and sockets, LOD budgets and the Khronos validator. It independently samples 121 times in each of the four strike clips, comparing both original/candidate weapon sockets.
5. `measure_deformation.mjs` compares skinned shoulder edge stretching and cape/body triangle intersections across 20 selected poses.
6. `save_editable_source.py` imports the final GLB to an editable Blender document, packs the textures, retains all 13 actions and displays LOD0 by default. The editable `.blend` is a convenience import; the annotated static atlas and scripts are the authoritative build source.
7. With `--render`, `render_pose_review.py` reimports the final GLB and renders 22 near poses and seven far poses from front, side and rear. Studio renders use Cycles with eight denoised samples and are appearance checks, not game-performance measurements.

The rebuild writes `intermediate-rigged-metrics.json` before the far-LOD result and `final-validation.json` after verification into the chosen output directory. The integrated source receipt and final candidate hash are in `handoff-summary.json`; its historical scratch paths do not replace the durable source paths above.

## Measured results

Final SHA256: `776a3cf088b531c3d89748500f380b95bec6df1e51d62b9de193d2d90bd3fba1`. Size: 11,254,352 bytes, an embedded PNG source master for the existing KTX2/meshopt tier packager.

| LOD | Triangles including weapon | Vertices | Max influences | Primitives |
| --- | ---: | ---: | ---: | ---: |
| 0 | 23,208 | 33,945 | 2 | 2 |
| 1 | 14,413 | 26,032 | 2 | 2 |
| 2 | 7,777 | 11,872 | 3 | 2 |

Two materials; zero Khronos validation errors; the same three non-root skinned-node warnings as the original hierarchy. The retained weapon is 204 triangles in every LOD. Across 484 sampled strike times, maximum WeaponBase and WeaponTip displacement is 0 m. All four combat clips remain byte-exact.

Across the 20 geometry samples, maximum shoulder underarmor edge stretch falls from 7.641× to 2.9881×. Summed cape/body intersecting triangle pairs fall from 2,166 to 30. Neutral, walk, dodge and raised overhead samples have no intersections below the rest-space attachment cutoff. The remaining samples are side contact (12 pairs, six cape triangles) and backhand contact (18 pairs, eight cape triangles). Counts exclude cape triangle rest-space centers above 1.92 m, and measure surface intersections rather than physical penetration depth. They do not prove continuous collision-free movement.

The complete near review is in `final-pose-qa` (66 images and JSON timing index); far review is in `final-far-qa` (21 images). All 13 clips and all four strike windup/contact/follow poses are represented in near review. The death render uses adjusted framing to include the prone body. Small far facets and practical joint gaps remain consistent with the mobile geometry budget.

Unchanged Ash Knight and Crypt Warden assets were reviewed in seven key poses each across three views. Their coarse rigid shoulder construction does not share the Sovereign's anatomical weight cutoff, so no mesh changes were made. Shared foot planting, ground correction, secondary-motion resets, compressed variant encoding and physical-device frame timing remain integration/runtime work.

## Integration notes

Update the existing exact-animation preservation test to allow only `dodge/cape_lower/rotation` to differ. Continue requiring all four strike clips and every weapon-ancestor track to match exactly; freeze all 390 input timelines/interpolation modes. Source `.blend` re-export can reorder data, so package the validated master through the normal GLB tier pipeline.

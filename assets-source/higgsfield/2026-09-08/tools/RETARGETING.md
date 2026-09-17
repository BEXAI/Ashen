# Normalize and retarget Meshy character exports

`normalize-retarget-glb.cjs` keeps the target mesh, skin, inverse-bind matrices, rest nodes, image data, and original binary chunk unchanged. It adds new animation accessors and optional weapon sockets. It never copies donor limb translations, bone lengths, or limb scales.

```sh
node /Users/nathaniel/Documents/ChatGPT/Knight/references/higgsfield-september-8-2026/tools/normalize-retarget-glb.cjs \
  /absolute/target-original.glb /absolute/target-runtime.glb \
  --profile knight \
  --clip forward=/absolute/animations/forward.glb \
  --clip side=/absolute/animations/side.glb \
  --contact-base 0,8,0 --contact-tip 0,98,0
```

Repeat `--clip name=file.glb` for the remaining real clips. A multi-animation donor requires `file.glb::AnimationName`. The utility preserves the target's own idle as `idle`; supplying donor idle or turn is rejected. Turning is handled by runtime actor yaw. The 12 required runtime names are `idle`, `forward`, `backward`, `strafe_left`, `strafe_right`, `dodge`, `hit`, `death`, `side`, `diagonal`, `backhand`, and `overhead`. `--require-complete` prevents publishing an incomplete GLB. Otherwise missing clips are listed clearly; no missing motion is fabricated. Extra genuine class clips can also be appended with their own names.

The output's `.retarget-report.json` includes source file hashes, source animation names, actual clip durations, mapping/rejection details, all material changes, root-scale fixes, leg-length ratios, socket measurements, and sampled raw/normalized skinned bounds. Donor `.source.json` sidecars are embedded in each animation's provenance, including actual provider action/job IDs. `--provenance-json PATH` embeds the exact original artwork UUID/hash, original model hash, model job, and any locally derived input hash in root `extras.higgsfieldSource`. `.validation.json` contains complete glTF Validator results. `--force` permits replacing these generated outputs. Dependencies resolve from `/Users/nathaniel/.cache/ashen-september-deps`, or from an explicit `--deps-root`.

## Motion policy

Bone names identify correspondences; bind orientations supply the correction. For each source local quaternion `q`, the output is:

```
inverse(targetParentRestWorld) * sourceParentRestWorld
  * q
  * inverse(sourceRestWorld) * targetRestWorld
```

All terms are rotations. The rest orientation mapping is checked for every track. Quaternion continuity is maintained, and cubic quaternion tangents are transformed without treating them as unit rotations. Unmatched source channels are reported. A donor must map at least half the target's rotation tracks; incompatible skeletons fail explicitly.

Incoming limb translation and scale tracks are discarded. Every imported clip instead gets the target's own constant limb translations and scales. Hips motion is projected onto world vertical, converted into the target parent's coordinates, and scaled by the target/source average thigh-plus-shin length. The horizontal Hips location stays at the target rest location. Feet/toe lengths are never copied from a donor. This is rotational retargeting, not foot IK: small differences in foot contact remain possible and should be checked visually.

The target's own idle keeps its authored rotations. A constant uniform Meshy root scale above/below one is normalized to one, with the same root translation divided by that scale. Animated or anisotropic root scaling is rejected instead of guessed. This follows the documented correction in [Higgsfield's Meshy animation merger](https://raw.githubusercontent.com/higgsfield-ai/skills/main/higgsfield-websites/scripts/glb_merge_anims.py). Clip time starts are shifted to zero without changing duration or sampling.

## Materials and sockets

`knight` uses metallic `0.35`, roughness `0.60`; `nonmetal` uses metallic `0`, roughness `0.80`. `--metallic` and `--roughness` override those values. Specular factors are clamped to the valid range. `emissiveFactor` becomes zero to disable whole-body emission; all texture references and image bytes remain intact.

Socket coordinates are explicit values local to `--contact-bone` (default RightHand; ranger uses LeftHand). Omitting both coordinates creates only recommendations in the report. With both coordinates supplied, `ContactBase` and `ContactTip` become direct children of that hand. For the silver knight, one hand-local unit is approximately one centimeter. `[0,8,0]` to `[0,98,0]` defines a provisional 0.90 m segment along local +Y. These are proposed coordinates for separately equipped runtime geometry; the original model's sword is sheathed. They are not claimed to follow an existing held blade. The runtime owner must validate grip orientation and weapon placement.

The silver knight hand has 914 vertices with at least 50% RightHand weight. Its local Y range is approximately −1.32 to 19.23 cm; its wrist rests at `(−0.496, 1.056, 0.105)` m. The provisional contact endpoints rest at `(−0.523, 0.989, 0.138)` m and `(−0.823, 0.229, 0.516)` m before animation.

## Bounds and verification

`sample-skinned-bounds.cjs` evaluates actual CPU skinning for the rest pose and 17 uniform samples per clip, including morph deltas and socket/bone world positions. Its bounds are sampled estimates, not continuous extrema. Static mesh bounds are misleading for this export: the pilot's `.01` Armature transform gives a static 0.0185 m box, while the skin/inverse-bind transforms produce its actual 1.85 m rest height.

The complete silver pilot was generated as `models/silver-knight-runtime.glb` with all 12 canonical clips, 24 original joints, and the two provisional sockets. Its validator has zero errors. The source's non-root-skinned-node warning is retained; unused original idle accessors produce informational messages because original bytes are preserved. The raw idle reached 2.054 m in sampled world Y before scale correction; normalized idle reaches 1.746 m in its crouched pose. Rest geometry remains exactly 1.850 m tall.

Run the regression checks after regenerating the complete pilot:

```sh
node /Users/nathaniel/Documents/ChatGPT/Knight/references/higgsfield-september-8-2026/tools/test-normalize-retarget-glb.cjs
```

For mobile/HD variants, run `inspect-optimize-glb.cjs` on the normalized runtime GLB. Material normalization must precede that optimizer because the raw Meshy pilot contains invalid specular factors.

## Complete roster build contract

```sh
node /Users/nathaniel/Documents/ChatGPT/Knight/references/higgsfield-september-8-2026/tools/build-runtime-assets.cjs
# Optional positional slugs limit a rebuild, for example silver-knight sage.
# A repaired derivative can be explicit: reaper --input reaper=/absolute/reaper-equipment-repaired.glb
# Pair repair/authorship metadata: --derivation reaper=/absolute/reaper-equipment-repair.json
```

This creates `models/<slug>-runtime.glb`, reports alongside it, and `models/optimized/<slug>/<slug>-runtime.{mobile1024,hd2048}.glb`. The incremental `models/runtime-build-summary.json` lists paths, exact SHA-256/byte counts, provenance, actual animation action IDs, durations, rig/sockets, and sampled bounds. `models/runtime-assets.SHA256SUMS` covers all generated GLBs. Originals remain unchanged. All 16 are present: 13 provider-generated humanoids, a locally rigged spider using its provider mesh, and two explicitly locally authored stylized ogre/goblin interpretations. Both provider attempts for ogre/goblin returned no model; the fallback provenance states these are not provider reconstructions or exact source-derived topology.

Explicit input/derivation choices persist in `models/runtime-source-overrides.json`, preventing later full rebuilds from silently reverting a repaired model. Derivation metadata can supply measured `contactSockets:{parent,base,tip}`, or locally authored `contactBaseExportedRightHandLocal`/`contactTipExportedRightHandLocal` values. Socket coordinates always use that specific rig's local units; the authored ogre/goblin rigs use meters and must never receive the pilot's centimeter defaults.

Blade characters, including the authored goblin, use four distinct sword actions (side 219, diagonal 97, backhand 240, overhead 242). Sage, frost mage, and lich use genuine staff action 130 under each of the four canonical strike names; ranger uses bow 224; golem, ember dragon, and shrouded skeleton use claws 4; authored ogre uses club 128. The aliases share the actual source motion and retain native duration. Runtime phase mapping supplies windup, contact, and recovery timing. Optional `--clip-duration NAME=SECONDS` uniformly retimes an entire clip and rescales cubic tangents, but this roster build intentionally does not use it.

The spider takes `models/spider-rigged.glb` with `--materials-only`: all 50 joints, authored 12 clips, fangs' contact markers, and skin weights remain intact. This mode never performs the humanoid root-scale correction or imports donor clips. The original static source model and derived rig hashes are both recorded.

`analyze-contact-motion.cjs INPUT.glb OUTPUT.json` samples ContactTip world motion at 120 Hz. It reports peak speed and a candidate fast-motion interval, not an observed collision or authoritative bow release. Equipment placement, recovery motion, and class semantics still require visual review. The utility does not silently trim native clips or invent contact timing.

`build-runtime-grounding.cjs [optional slugs]` evaluates 65 uniform samples per native clip. `models/runtime-grounding.json` has `{slug:{restMinY,clips:{name:[65 minimum-Y values]}}}`; sample index `i` means `i/64` of that clip's actual duration. The game can interpolate and lift by `max(0, restMinY-minY)`. These bounds include only geometry in the processed source GLB, with no separately equipped runtime props. `runtime-grounding-qa.json` records source hashes, native durations, required maximum lift, adjacent sampled changes, finite checks, and maximum extents. Grounding changes runtime placement, never rig transforms or retargeted motion data.

An optional `models/<slug>-grounding-exclusions.json` omits known held-equipment geometry while retaining all body/clothing. It accepts `nodeNames`, `meshNames`, and/or `vertexSets:[{mesh:0,primitive:0,vertices:[...]}]`, plus a human-readable `reason`. Meshes/nodes explicitly tagged `extras.excludeFromGrounding:true` are also omitted. Indices refer to the final runtime GLB, whose source vertex order is preserved. The grounding QA records every applied exclusion. This is only a sampling filter; it does not remove render geometry or alter collision sockets.

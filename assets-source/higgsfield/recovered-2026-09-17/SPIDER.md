# Recovered September 9 spider

This package uses the actual recovered Tripo mesh from job `67d5e2fe-bf89-47a9-b8fb-22c46c754faf`, created `2026-09-09T00:27:24.111659Z` (September 8 in New York), and artwork `c4010a07-000c-439c-b8da-2a200549f97a`. The original file is untouched. It is a different mesh from the earlier Meshy spider.

## Delivery

| Variant | File | Triangles | Bytes |
|---|---|---:|---:|
| Mobile | `optimized/spider/spider-runtime.mobile1024.glb` | 24,005 | 2,929,980 |
| HD | `optimized/spider/spider-runtime.hd2048.glb` | 57,158 | 6,026,916 |

Both have one material, three maps, a 50-joint eight-leg rig, `ContactBase`/`ContactTip`, and the twelve named clips: idle, forward, backward, strafe_left, strafe_right, dodge, hit, death, side, diagonal, backhand and overhead. These clips are locally authored, IK-baked motion fitted to this mesh. They are not humanoid retargets or provider mocap.

Use `spider-manifest-entry.json` for integration; it explicitly has `equipment:"embedded"`, `contactSockets:"embedded"` and `contentVersion:"recovered-september9-v1"`. No runtime handheld prop should be added. The entry preserves a 1.25m target height and canonical +Z facing. Its relative prepared paths let the integrating task assign versioned public URLs safely. This replaces the existing artwork identity, not a second character. No shared manifest was edited by this task.

`spider-grounding.json` has conservative 65-sample curves combining the final decoded mobile and HD geometry. Apply the existing runtime floor-lift contract. The bite envelope peaks at phase 0.5; `.34–.66` is a proposed active contact window for each authored strike. Actual game approach-distance, capsule and hit tests remain the integrating task.

## Preservation and shape decisions

The input faces +X. The derivative applies a −90-degree glTF Y rotation, a uniform authoring scale of 2, and a translation onto the floor. The runtime's own height scaling still controls the visible creature size. Native full-resolution bounds are approximately **2.0000 × 0.9417 × 1.7781m**. Eight outer-leg components are found using virtual seam welding and a 0.32-unit lateral cutoff; this discovery does not alter source topology. Each leg receives four fitted deforming segments with IK foot controls. Body, abdomen, head, fangs and palps have separate weighted motion.

`spider-source-preservation.json` verifies all **57,158 oriented source triangles**, all **34,432 source vertices**, and all three original JPEG texture byte streams in the full-resolution runtime master. The largest source-position difference after the rigid transform/export is **8.94e-8m**. The source input SHA256 remains `756b617f8392c3a43ac8432dee4182ee52fd51cbf20803c52e90c6877ed3db1f`.

Only the mobile derivative is decimated: Blender collapse ratio 0.42, applied in rest pose before the armature modifier. UVs remain; weights are limited to four and renormalized. It has 24,005 triangles. The source and HD meshes remain complete. Mobile shape and all attack/death poses were inspected after actual compressed GLB decoding; the articulated silhouette is retained, while fine surface geometry is intentionally reduced. The source's existing shell markings and texture detail are retained; no photorealistic or exact-reference reconstruction claim is made.

Material normalization uses metallic 0 and roughness factor 0.8 while preserving PBR maps. Optimized variants use lossless Meshopt buffer coding and WebP image conversion after a 1024px/2048px cap. They require the game's existing Meshopt/WebP support. Optimization preserves all rig and animation buffer bytes from each respective runtime master.

## Verification

- Direct and decoded-mirror glTF validation: **zero errors** for both variants.
- The exported full-resolution GLB was reimported into Blender: all twelve clips and 60 representative poses are finite, with no deformation spikes.
- Both final optimized variants: **1,560 evaluated poses** (12 × 65 × 2), all finite; maximum extent 2.17461m and lowest pre-lift point −0.001589m.
- Weights are normalized, with zero unweighted vertices; mobile maximum sum error is 1.42e-7 before export.
- Mobile gait and decoded attack/death contact sheets were visually inspected. See `review/spider-mobile-gait/gait-contact-sheet.png` and `review/spider-final-actions/action-contact-sheet.png` (panels: forward, side, overhead, death).

`spider-build-summary.json`, `spider-grounding-qa.json`, `spider-mobile-decimation.json`, variant reports and `spider.SHA256SUMS` record exact files and checks. Final in-game framing, lighting and swept weapon-contact checks are outside this asset-only task.

## Reproduce

Run from the recovered package directory, with the existing Blender Python environment:

```sh
/path/to/blender-python tools/rig-spider.py
/path/to/blender-python tools/decimate-spider-mobile.py
node tools/spider-pipeline/normalize-retarget-glb.cjs derived/spider-rigged.glb runtime/spider-runtime.glb --materials-only --profile nonmetal --require-complete --provenance-json spider-provenance.json --force
node tools/spider-pipeline/normalize-retarget-glb.cjs derived/spider-rigged-mobile.glb runtime/mobile/spider-runtime.glb --materials-only --profile nonmetal --require-complete --provenance-json spider-provenance.json --force
node tools/optimize-spider-variants.cjs runtime/spider-runtime.glb optimized/spider --variant hd2048 --force
node tools/optimize-spider-variants.cjs runtime/mobile/spider-runtime.glb optimized/spider --variant mobile1024 --force
node tools/ground-spider.cjs
node tools/audit-spider-source.cjs
```

All recipe sources are retained under `tools/`; the native editable fitted rig is `derived/spider-rigged.blend`. Node recipes find installed dependencies in the containing repository, then an existing sibling checkout. Explicit `--deps-root`, `ASHEN_ASSET_DEPS` or `ASHEN_PACKAGE_JSON` overrides are supported. They do not install dependencies or embed a user-specific default path. The geometry recipe refuses a source with a different hash. No paid jobs, source overwrites, Site edits or GitHub edits were used for this spider package.

# Recovered Reaper delivery

This package derives from the archived September 9 Tripo Reaper model, associated with source artwork `ae17a6dd-ffae-472e-b762-c9cb6ed2e584`. The unmodified model and its provider receipts remain in `models/`, `inventory.json`, and `receipts/`. It is a provider reconstruction with locally fitted rigging, not an exact reconstruction or a newly licensed asset. No license terms are inferred.

`reaper-manifest-entry.json` is the merge-safe runtime entry. Its relative variant paths must be assigned the destination URLs by the importer. `reaper-grounding.json` contains the Reaper-only, 65 samples per clip floor curves. `reaper-build-summary.json` and `reaper.SHA256SUMS` bind the derivative files to this package.

Both compressed variants retain all **59,342 triangles / 38,028 vertices**, 24 joints, three maps, one material, and 12 named clips. Mobile caps textures at 1024; HD caps them at 2048. HD retains already compact original JPEG streams, so it is slightly smaller than the resized, higher-quality JPEG mobile derivative. Geometry has not been decimated.

## Rig and motion repair

The initial surface-nearest weight transfer produced disconnected hand and knee influence islands across the cloak. The repaired skin uses a continuous torso/hood field, fitted arm capsules, fixed anatomical anchors and 100 iterations of seam-aware topology smoothing. The flowing lower robe follows the Hips as one garment; this is not simulated cloth. The source positions, normals, UVs, triangle topology and original image streams are preserved through the skin repair. The source’s complete diagonal scythe, including its flared shaft tail, uses a measured 1,939-vertex rigid RightHand mask.

The genuine native clips retain their durations and rest-aware retargeting. A 48 Hz analytic arm IK pass maintains the original two-hand shaft grip while preserving both arm segment lengths and the donor right-wrist orientation. Some donor hand positions are projected into the feasible two-arm reach volume. The largest primary-hand adjustment is about 0.33 source meters; this is recorded in `reaper-grip-qa.json`. This repair is explicitly a local motion constraint, not untouched native arm animation.

`ContactBase` and `ContactTip` lie on the actual curved blade and remain children of RightHand. `reaper-contact-qa.json` records active-phase endpoint positions and source-space reach. The configured 2.65 m runtime height scales the 1.85 m source body. The runtime must apply the supplied floor curves, especially during dodge and death. The scythe mask is excluded from those curves; body/clothing are included.

## Verification and limits

- Source and compressed/decoded variants have zero glTF validator errors. Direct validation reports the runtime-generated tangent-space warning. Decoded validation also reports benign nonzero joint indices in zero-weight slots (65,288 repeated warnings); these slots have no skinning effect. Compact code/count summaries are retained alongside the pose checks.
- Both actual compressed variants were sampled across 65 poses in each of 12 clips: 1,560 finite poses total. Their body bounds match the uncompressed master exactly.
- Walking and eight action poses were rendered and inspected. The old mesh spikes and stretched shaft tail were repaired; the complete scythe and two grips are retained.
- Uniform pose samples do not guarantee continuous extrema. Interpolated floor lift is required. The final runtime contact test belongs to the game importer.
- Both variants retain the full triangle count. The mobile derivative reduces texture resolution only.

## Reproduction

Run from this package directory. Node dependencies resolve from the containing repository or an explicit `--deps-root`; no dependencies are installed by these recipes. Python needs NumPy; visual QA additionally needs a Blender Python environment.

```sh
python3 tools/reskin-reaper.py
node tools/build-reaper-base.cjs --deps-root /path/to/project --donors-root /path/to/archived/animations
node tools/constrain-reaper-grip.cjs --deps-root /path/to/project
node tools/compact-reaper.cjs
node tools/reaper-pipeline/inspect-optimize-glb.cjs runtime/reaper-runtime.glb optimized/reaper --deps-root /path/to/project --force
node tools/package-reaper.cjs --deps-root /path/to/project
```

Retain `derived/reaper-rigged.glb`, `derived/reaper-rigging.json`, all Reaper recipes, `tools/resolve-deps.cjs`, and `tools/reaper-pipeline/`. The fitted rig input records the canonical orientation and fitted rest transforms. The original retarget report contains exact animation job IDs and hashes. `compact-reaper.cjs` drops superseded arm samplers and repacks live accessor bytes; it changes no live geometry or motion values.

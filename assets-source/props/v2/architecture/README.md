# A03 architecture kit handoff

Ready for root integration. No files in the game or Site checkout were edited by this asset task.

## Runtime delivery

| File | Bytes | SHA-256 |
|---|---:|---|
| `architecture-kit.glb` | 1,013,076 | `bbec76f1153187abf396336642a0f2a29a33e401f81de3ebdf5155029b523f31` |
| `architecture-kit-fallback.glb` | 1,108,388 | `d8cc29ab074cdcc116b74c79fdd51b756742eb492a860276fe350bd589446429` |

Both files contain all three modules and all three LODs. The primary uses meshopt geometry with ETC1S base color and UASTC normal/ORM KTX2 textures; fallback uses identical meshopt geometry and PNG textures. All three embedded images are verified 512×512. They are shared across every mesh and instance. Estimated RGBA8 texture storage including the complete mip chain is at most **4 MiB**, including the PNG fallback. Do not load both variants simultaneously. The original 2048 base-color bake is retained in `textures/kit_basecolor_source.png` and is not embedded in runtime delivery.

| Module | LOD0 triangles | LOD1 | LOD2 | Near dimensions, X/Y/Z metres |
|---|---:|---:|---:|---|
| Arch | 5,992 | 2,992 | 1,192 | 7.76 / 8.88 / 0.949 |
| Pillar | 1,192 | 592 | 232 | 0.70 / 5.20 / 0.90 |
| Trim | 592 | 292 | 112 | 2.00 / 0.35 / 0.50 |

One draw/primitive per module at any selected LOD; one shared material for the entire kit. Rendering one copy of all three modules costs 7,776 / 3,876 / 1,536 triangles by LOD. There are 13,188 stored triangles across all nine LOD meshes. Raw cloud source was 118 primitives, 11,404 triangles, two procedural materials, zero textures, 660,968 bytes. Its smaller file size did not include the portable baked appearance or runtime LODs.

## Runtime contract

- Root `AshenArchitectureKit` is identity: position 0, quaternion identity, scale 1. Metres, +Y up, +Z toward the decorated front.
- Nine direct mesh children: `Arch_LOD0` through `Arch_LOD2`, `Pillar_LOD0` through `Pillar_LOD2`, and `Trim_LOD0` through `Trim_LOD2`.
- Every mesh has `extras.module` (`Arch`, `Pillar`, `Trim`) and integer `extras.lod` (0–2). Keep exactly one LOD visible per placed module. Do not add the whole imported scene with all nine meshes visible.
- All module ground/base-centre pivots coincide at local origin. The source review places pillar at Blender `(5.3,0,0)` and trim at `(5.3,0,5.7)`; these display offsets were removed before runtime export.
- Precompression mesh transforms were identity. Meshopt quantization introduces affine node matrices: preserve the loaded mesh's full local/world matrix when instancing, or bake it into a cloned geometry once before constructing instances. Never discard that matrix or infer a runtime transform solely from a mesh's position.
- Six semantic anchor empties survive. `extras.semantic_name` resolves `Arch_Ground`, `Pillar_Ground`, `Trim_Ground` at `(0,0,0)`, `OpeningLeft` at `(-3,0,0)`, `OpeningRight` at `(3,0,0)`, `OpeningTop` at `(0,6.8,0)`. Node names have `_Runtime` suffix. Each anchor also carries `extras.module` and `semantic_anchor:true`.
- Near arch occupies X ±3.88, Y 0–8.88, Z −0.45–0.499. Near pillar occupies X ±0.35, Y 0–5.2, Z ±0.45. Trim occupies X ±1, Y 0–0.35, Z −0.215–0.285. Quantized exact bounds per LOD are in `final-export-audit.json`.
- All three arch LODs preserve the 6 m × 6.8 m rectangular passage/gate clearance. Every decoded triangle was transformed by its actual full matrix and clipped against that keepout through the entire kit depth; zero intersections with 0.1 mm boundary tolerance.
- Decorative kit only: no collisions, state changes, moving gates, lights, cameras, skins, animation or permanent torch/shrine spill. Place ornament in existing walls and retain existing gameplay collision and gate logic.

## Source and derivation

Original privately authored Blender geometry, materials and code, committed through Higgsfield 3D Jutsu. No imported catalog models, external textures, copied logos or image references.

Project: https://higgsfield.ai/3d-jutsu/1d6dfef7-341a-43ea-bb7f-c5b7f36b4292

- Workspace: `bdeb1056-93d9-4c2d-8b80-389d588bab2f`.
- Project: `1d6dfef7-341a-43ea-bb7f-c5b7f36b4292`.
- Sole authoring operation: `36b5a389-5fc8-461c-8640-b3007ca9f709`, succeeded, committed revision 1 / scene sequence 0; no active operation remains.
- Original submitted code: `author_kit.py`.
- Committed downloads: `cloud-source.blend` (editable), `cloud-source.glb` (raw export).
- Published cloud preview: `cloud-source-review.png`; artifact `59f51723c7d8bc8d375476acf4cf495d`.
- Evidence: `cloud-operation.json`, `cloud-project-checkpoint.json`, `production-ledger.json`, `source-and-delivery-hashes.json`.
- Local derivation: outward-normal repair, near-mesh simplification, one common UV0 atlas, actual selected-to-active color/roughness/metallic/tangent-normal/AO bake from the committed source, ORM packing, per-module LODs, PNG reload to ensure downsized image bytes, meshopt/KTX2 packing. No room UV1 or geometry was changed.
- `architecture-baked-workfile.blend` retains the local bake scene and review layout; `architecture-kit-baked.glb` is the uncompressed portable derivative before runtime packaging.
- `local-source.blend` and `local-source-review.png` are preflight-only files. The final derivative was built from `cloud-source.blend`; do not mistake preflight source for committed provenance.

## QA

`validate_runtime.mjs` independently reads the actual primary and fallback. Both decoded GLBs have zero glTF-validator errors, warnings, hints or infos. Encoded validator reports are retained in `runtime-manifest.json`; unsupported-compression-extension notices do not validate decoded data, so the clean decoded validation is also required. Geometry bytes and all nodes/anchors match between variants. All nine meshes have explicit positions, normals, tangents and UV0, zero degenerate triangles, the expected bounds, a single primitive and shared material. Actual embedded texture sizes are asserted rather than inferred from the PNG masters.

The cloud preview and the actual primary LOD0/1/2 plus fallback LOD0 reimport renders were inspected. They retain the arched silhouette, course seams, flutes and iron inlays; primary and fallback look consistent. The far LOD has modest corner simplification. Neutral offline lighting is used; root owns final placement, distance thresholds, floor contact, renderer tone mapping and in-game visual acceptance.

Previews: `compressed-lod0-review.png`, `compressed-lod1-review.png`, `compressed-lod2-review.png`, `fallback-lod0-review.png`. The decoded QA GLBs are inspection files only, not runtime delivery.

The connector's instructions mention `query_python` and final `show_scene`, but neither tool nor a tool search mechanism was available in this session's callable inventory. The initial scene was confirmed empty through `get_project`; delivery was verified through the committed published image, actual Blender/GLB downloads and local reimport renders. The project link is supplied for interactive cloud review. No claim that the missing viewer tool ran is made.

## Credits and rights record

User authorized 1,000 Higgsfield credits total across jobs, with at most two authoring attempts per asset. Only one A03 authoring attempt was used. Shared balance was 4,113.5 before creation, after creation, after the successful edit, and after exports. **Observed A03 credit delta: 0.** Direct create/run/export pricing was not stated by the connector; this observation is not a promise of free future jobs. A02 settled before A03 dispatch. No subscription, account preference or catalog purchase was changed.

Official sources checked September 9, 2026:

- [Higgsfield Terms of Use](https://higgsfield.ai/terms-of-use-agreement), updated July 26, 2026, Sections 4.2/4.4: Higgsfield does not claim ownership of user content/outputs and does not restrict commercial output use. This does not guarantee exclusivity or third-party clearance. Section 11.8 makes developer attribution conditional on documentation/brand requirements.
- [Ownership and commercial use help](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially): output attribution is not generally required; commercial rights are not limited to a particular paid tier.
- [MCP pricing](https://higgsfield.ai/mcp-pricing): link returned by the balance tool; no direct-operation price was provided by the 3D connector.

This asset uses only original authored content and no catalog asset license is being inferred from the subscription. Suggested provenance credit, if desired: “Original AI-assisted architecture authored for Ashen Realm in Higgsfield 3D Jutsu; optimized and baked locally.” This is provenance, not a claim of Higgsfield endorsement.

## Rebuild

Requires the existing workspace bpy environment and game Node dependencies, plus the local KTX tools used by `package_runtime.mjs`. All outputs stay in this directory by default; `KIT_OUT` can point to another artifact-only directory.

```sh
/Users/nathaniel/Documents/ChatGPT/Knight/.tools/blender-venv/bin/python prepare_runtime.py
node package_runtime.mjs
node validate_runtime.mjs
/Users/nathaniel/Documents/ChatGPT/Knight/.tools/blender-venv/bin/python render_runtime.py
```

`prepare_runtime.py` reads the committed `cloud-source.blend`, not the preflight file. It rebuilds the bake by default. `KIT_REUSE_BAKES=1` is valid only when source materials, geometry, atlas UVs and bake settings are unchanged; it was used solely to repack the runtime base map to 512 after the fresh cloud-source bake. Do not rerun `author_kit.py` remotely as part of a local rebuild.

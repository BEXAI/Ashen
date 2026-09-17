# Ashen Realm — torch sconce pilot

Primary game delivery: `sconce-pilot.glb` and `sconce-pilot-fallback.glb`.
Both files contain one identity asset root, three LOD mesh nodes, one shared PBR
material, three shared textures, and Mount / FlameOrigin / LightOrigin anchors.
Select exactly one LOD mesh per instance. Preserve the mesh node matrix because
meshopt quantization stores scale/offset there. The asset root stays identity.

Original cloud source: `cloud-source.blend`, `cloud-source.glb`,
`cloud-source-review.png`. The committed project is
https://higgsfield.ai/3d-jutsu/21434c15-bdde-4abd-bcb9-62098cae463a at revision 1.
Authoring operation: `84214dd5-f7bf-4d10-ac8c-255a35559496`.
`author_sconce.py` is the exact original code executed by the cloud worker.
No catalog model, external image, or third-party texture was incorporated.

The raw cloud GLB has 6,468 triangles in 21 draws, two materials, and no textures.
Procedural shading did not transfer, so it is retained as source evidence rather
than used directly in the game. The local derivative recalculates outward normals,
bakes actual base color / tangent normal / roughness / metallic / AO textures,
packs ORM, and produces 1,492 / 580 / 188 triangle distance meshes.
LOD2 is an explicit silhouette proxy; it shares the same atlas and material.
Its simplified backplate and omitted small trim are appropriate only at distance.
Suggested starting thresholds: LOD1 below 85 screen pixels high, LOD2 below 35.
The game camera must verify those thresholds and any switch artifacts.

## Reproduce locally

Use the existing Blender Python and Node dependencies in the Knight workspace.
The source `.blend` is an input; rerunning these scripts does not call Higgsfield.

```sh
/Users/nathaniel/Documents/ChatGPT/Knight/.tools/blender-venv/bin/python prepare_runtime.py
node package_runtime.mjs
node validate_runtime.mjs
/Users/nathaniel/Documents/ChatGPT/Knight/.tools/blender-venv/bin/python render_runtime.py
```

Run from this directory or supply `SCONCE_OUT` for the artifact directory. The
preparation script defaults to a fresh deterministic bake; `SCONCE_REUSE_BAKES=1`
is only for unchanged geometry/UVs/materials when re-exporting. `far_proxy.py`
must sit beside `prepare_runtime.py`. Packaging uses local `toktx`, `ktx`, and
the installed game Node packages; paths are explicit in the scripts.

`sconce-combined-baked.glb` is the uncompressed PNG master and
`sconce-baked-workfile.blend` contains editable local source and runtime objects.
Per-LOD files and decoded GLBs are QA intermediates. Do not load all individual
files in the game because that would duplicate the atlas in memory.

## Verification and provenance

`runtime-manifest.json` records the primary files, exact bytes/hashes, geometry,
texture sizes, compression, and documented local changes.
`final-export-audit.json` verifies shared resources, decoded geometry equality,
bounds, explicit tangents, identity root, anchors, mip levels, and clean decoded
glTF validation. `compressed-lod*-review.png` shows each LOD rendered from the
actual combined KTX2 model after decoding. `fallback-lod0-review.png` shows the
actual combined PNG fallback. Their geometry is identical; color compression
slightly smooths the finest texture variation.

`placement-contract.json` preserves the game's flame Y=3.4 and light Y=3.7.
It specifies an unscaled core placement and a separate 0.735 m stone wall corbel.
The corbel belongs to room integration and is not inside this asset's bounds.

`production-ledger.json` records balance observations, source hashes, licensing
links, credit authorization, and local derivation. Balance was 4113.5 before and
after project creation, authoring, and final readback: observed delta zero. Direct
operation rates were not published, so this is not a promise of free operations.
The user authorized 1000 total credits; only one authoring attempt succeeded.

Higgsfield output-rights terms support commercial use of original output, but
they do not imply blanket catalog licensing or exclusive copyright. No catalog
content was used here. The advertised `scene_builder_3d_show_scene` helper was
not exposed by the connector, so delivery uses the verified cloud render,
committed downloads, and project URL; no interactive-helper success is claimed.

No Site files were changed by this pilot authoring task. In-game placement,
mobile frame-rate checks, and final user-facing approval remain root integration.

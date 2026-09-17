# BoneThrone runtime package

Prepared outside the Site checkout from 3D Jutsu project `02765069-6a15-4d44-852b-025f53032fdf`, committed revision 1. The original GLB and editable Blender file are retained under `source/` with project/download receipts. Source catalog ID `65b31468-5c24-440c-9a95-99db1b195b67` is embedded in the exported node metadata. Available receipts provide no license terms: no public-domain, CC0, or original-authorship claim is made.

## Delivery

- `bone-throne.glb`: 186,636 bytes, lossless Meshopt compression.
- `bone-throne-fallback.glb`: 376,720 bytes, core glTF only; no decoder extensions.
- `runtime-manifest.json`: standalone `/assets/props/v3/manifest.json` contract with one `boneThrone` entry, hashes, bounds, placement and collision recommendations.
- `bone-throne-normalized.blend`: local editable import of the normalized runtime, without the QA studio.
- `provenance.json`, `final-export-audit.json`, `SHA256SUMS`: source identity, transforms and machine-readable validation.
- `qa/threequarter.png`: actual decoded compressed GLB render; full comparison evidence remains in the local authoring package.

The runtime has one mesh, one material, one draw primitive, 6,120 triangles and 9,385 vertices. It has zero textures, skins or animations. The original bone/cushion/plinth colors are stored in `COLOR_0`; preserve vertex colors and the source material. There is one LOD. No fake secondary LODs or additional materials were introduced.

Normalization changes only the parent translation, centering X/Z and putting the lowest vertex at Y=0. Native dimensions are **0.880004 × 1.734702 × 0.960053 m**. The original +Y up and +Z front are retained and visually verified. `Ground` is the origin; `Front` identifies the forward base edge. Source-node metadata and all vertex-attribute bytes remain intact. Meshopt may cyclically rotate a triangle's indices, while preserving the exact triangle and winding; this is verified by oriented-triangle hashes. All exports have zero glTF validator errors. The compressed validator notes its unsupported Meshopt extension; decoder round-trip geometry is independently verified.

## Placement guidance for the integrating task

Use the side-relic placement **[-11, 0, -77]**, yaw **0**, uniform scale **1.45** in the throne chamber. This gives **1.276006 × 2.515318 × 1.392077 m** dimensions. Keep the existing baked central throne, dais, standards and architecture. This asset does not replace or hide the baked throne room mesh.

Proposed world AABB: X **[-11.638003, -10.361997]**, Y **[0, 2.515318]**, Z **[-77.696038, -76.303962]**. Use this XZ rectangle for body collision, expanded by each actor radius; a conservative compatible circle is `{x:-11,z:-77,r:0.944202}`. The audited `world.colliders` array was not consumed by movement, so merely adding its entry is insufficient. The integrating task must connect/test collision resolution and room visibility. The prop's existing +Z face looks toward the chamber entrance; yaw may be adjusted later with bounds recalculated.

One visible instance adds one draw and 6,120 triangles, with no texture allocation. The local package does not claim final in-game lighting, framing, collision or aggregate-budget validation.

## Reproduce

```sh
node assets-source/higgsfield/2026-09-17/bone-throne/package-throne.cjs
/path/to/blender-python assets-source/higgsfield/2026-09-17/bone-throne/render-throne.py assets-source/higgsfield/2026-09-17/bone-throne/qa/bone-throne-compressed-decoded.glb assets-source/higgsfield/2026-09-17/bone-throne/qa/runtime
```

The recipe resolves dependencies from the repository package.json; override with ASHEN_PACKAGE_JSON if needed. Running it rebuilds local derivatives only, without remote generation or project mutations.

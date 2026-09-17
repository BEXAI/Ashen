# Sovereign mobile art retrofit

The new armor, crown, face, cloth and cape come from the existing `sovereign_source.blend`, authored from a CC0 Dan Ulrich Human Base Meshes 1.4.1 anatomical foundation plus original project geometry and procedural materials. This is an adaptation of the existing authored sovereign; it is not exact reconstruction of the user's reference image.

Static mesh uses feature-specific collapse budgets, omits hidden inner boots and underarmor toes, joins one atlas material, and bakes the reduced mesh's procedural base color, tangent shader-bump normal, metal/roughness and emissive. Geometry normal detail is not transferred from high to low. Base color is 2048 px; three data/emissive maps are 1024 px. Emissive margin is reduced to avoid glow bleeding between packed islands.

The rig script retains the game's original 15 joints, inverse bind matrices, all 13 clips/390 channels and sword sockets. It transfers the detailed body using part-aware rigid plate weights plus blended underarmor/cape, and maps anatomy landmarks to the original rig proportions. Original weapon geometry (204 triangles) and atlas are retained as a second material. There are at most two nonzero skin weights per vertex in LOD0/1, and at most three in LOD2 after Blender interpolation. It is a practical rig retrofit, not animator-authored weight painting; extreme poses and garment collisions can still need art refinement.

Run these sequentially with a Python environment providing bpy 5.2.1 and a Node environment that can resolve the game's installed dependencies. Paths below are examples; all scripts accept explicit input/output paths and never write the original source blend or original rig.

```sh
python build_mobile_sovereign.py --source /path/sovereign_source.blend --out /path/staging
node rig_mobile_sovereign.mjs --game /path/game --rig-source /path/original-ember-sovereign.glb --static /path/staging/ember-sovereign-mobile.glb --parts /path/staging/geometry_budget.json --out /path/staging
python reduce_far_lod.py --master /path/staging/ember-sovereign-rigged-master.glb --out /path/staging/far-lod-transfer.glb
node graft_far_lod.mjs --game /path/game --master /path/staging/ember-sovereign-rigged-master.glb --far /path/staging/far-lod-transfer.glb
python render_rig.py --asset /path/staging/ember-sovereign-rigged-master.glb --out /path/staging/rig-qa
python render_rig.py --asset /path/staging/ember-sovereign-rigged-master.glb --lod 2 --out /path/staging/far-qa
```

The far reduction runs Blender collapse directly on imported LOD0 at ratio 0.33, then grafts only remapped geometry back into the unchanged master. It retains original weapon geometry and reuses the body atlas. Stable orthogonal fallback tangents repair degenerate UV poles before Khronos validation.

Master after far graft: 11,243,076 bytes; LOD triangles 23,208 / 14,241 / 7,777; two materials/draw primitives per LOD. Static atlas mesh: 23,004 triangles, 5,311,772 bytes, no rig/animation. Original source: 580,034 evaluated triangles.

Validation: Khronos validator 0 errors and 3 existing non-root skin-node warnings; independent contract test confirms exact original joints, bind matrices, animation sample bytes, socket transforms. Reimported final GLB review includes front, three-quarter, forward movement, side at 0.25 s and overhead at 0.44 s (active-window midpoints), plus far-LOD review. At far LOD the crown, chest plates, cape and boots remain recognizable, while thin emissive channels lose visibility. Device frame time is not measured by these asset tests. Runtime compression/texture tier packaging belongs to the game integration script.

Final reviewed authoring master in this folder: `ember-sovereign-rigged-master.glb`. The five scripts are in `../../scripts/sovereign`; run the recipe from the game checkout with explicit source and staging paths. Runtime variants are encoded by `scripts/package-sovereign-mobile.mjs` with `ASHEN_TOKTX` pointing to Khronos toktx 4.4.2.

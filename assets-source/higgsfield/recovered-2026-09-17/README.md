# Recovered September 9 provider models

These are 14 existing Higgsfield generation outputs recovered from the official job history. They were generated September 9 UTC (September 8 in New York), before the later Meshy reconstructions. Downloading them created no generation jobs.

`models/*-original.glb` preserves the exact downloaded bytes; `jobs/*.json` preserves the official job receipt. `inventory.json` binds each original to its job, SHA-256, byte count, and exact source-image generation ID. Every source-image hash is verified against the preserved screenshot reference. Do not overwrite originals when rigging or optimizing.

`original-metadata.json` records decoded geometry, bind-aware bounds, textures, bones, and animation metadata. Three standard-provider outputs (Dusk Rogue, Frost Mage, Lion Knight) have 24-joint skeletons and a single static key at 0.3 seconds. They do not contain a usable animation. Ember Dragon and all ten Tripo outputs have no rig or animation. Original textures are 2048 pixels square. Rigging/retargeting and mobile optimization are separate derived steps.

`review/*-comparison.jpg` compares independently framed original and previous runtime geometry. The previous runtime panel excludes any equipment added by game code. These are neutral rest-pose asset views, not final lighting, combat, or mobile performance evidence. Review images and code are derivatives; original GLBs are unchanged. Camera directions and pre-normalization bounds are recorded in `review/render-notes.json`.

All ten raw Tripo models, including the spider, face glTF +X. Canonical facing conversion is -90 degrees around glTF +Y (Blender +Z), mapping +X to +Z. All fourteen per-character findings are recorded in `visual-review.json` and `visual-review.md`. Preserved originals retain their original coordinate systems.

Collection and metadata tools are in `tools/`. Canonical source artwork remains in `../higgsfield-september-8-2026/`. Keep previous runtime models until the recovered derived models pass equipment, pose, collision, and resource validation.

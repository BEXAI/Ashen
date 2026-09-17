The recovered Dragon recipe preserves the provider original and its exact material maps. Its retained fitted seed supplies canonical positions and the original skeleton orientation. The repair fits pivots to the visible body, uses continuous limb weights, keeps wings and curled tail on one coherent pelvic frame, and removes explicitly recorded chain-to-floor fusion faces only in the derivative. There is no authored wing-flapping motion.

Run from this recovered archive directory, with Python containing `bpy`, `numpy`, and `Pillow`, and the project Node dependencies installed:

```sh
python tools/reskin-dragon.py
node tools/build-dragon.cjs ember-dragon
node tools/dragon-edge-audit.cjs
```

The build reads `ASHEN_ASSET_DEPS` for the project dependency directory and `ASHEN_DONOR_ROOT` for the preserved native motion directory. In the repository layout, the latter is `assets-source/higgsfield/2026-09-08/models/animations`. These are caller-supplied paths; no personal workspace location is required. The broader recovered-asset orchestrator supplies them automatically.

Required immutable inputs are `models/ember-dragon-original.glb`, `derived/ember-dragon-rigged.glb`, `inventory.json`, `runtime-config.json`, the rigging metadata, and the native motion donors. The fitted seed is retained deliberately because its skeleton orientation is part of the reproducible rig input.

Outputs include `derived/ember-dragon-reskinned.glb`, the normalized runtime, both optimized delivery variants, `dragon-runtime-grounding.json`, and the preferred `ember-dragon-manifest-entry.json`. The original source is never overwritten. Exact removed face IDs and every final source/delivery hash are recorded in the repair and build reports.

Visual evidence samples actual Meshopt-decoded mobile delivery poses. It verifies sampled shape, facing, attachment, and grounding only; it does not establish continuous collision coverage or physical-device GPU performance.

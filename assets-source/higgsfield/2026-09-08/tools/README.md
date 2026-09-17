# GLB inspection and texture/compression variants

`inspect-optimize-glb.cjs` reads a self-contained GLB and writes a JSON inventory, validator results, checksums, and two optimized GLBs. It does not modify its input or contact any service. Static inputs stay static; this utility does not invent bones or animations.

Run:

```sh
node /Users/nathaniel/Documents/ChatGPT/Knight/references/higgsfield-september-8-2026/tools/inspect-optimize-glb.cjs \
  /absolute/path/source.glb \
  /absolute/path/output-directory \
  --deps-root /Users/nathaniel/.cache/ashen-september-deps
```

The hydrated dependency cache is preferred automatically when present. Otherwise, the utility resolves existing dependencies from `/Users/nathaniel/Documents/ChatGPT/Knight/game`. `--deps-root` selects another existing Node project; nothing is installed. Required libraries are `@gltf-transform/core`, `@gltf-transform/extensions`, `sharp`, `meshoptimizer`, and `gltf-validator`. An existing `draco3dgltf` decoder is optional for Draco inputs; Draco input fails explicitly when that decoder is unavailable.

For `source.glb`, output files are:

- `source.mobile1024.glb` and `source.hd2048.glb`.
- `source.report.json`, covering the original and both variants.
- `source.source.validation.json` and one validation JSON per variant.
- `source.SHA256SUMS`, covering generated models and reports.

Use `--inspect-only` for reports without model output. Use `--no-meshopt --no-webp` when the destination loader lacks those extensions. Existing named outputs are refused unless `--force` is supplied. `--help` prints all options.

## Preservation and inspection

The report includes node and bone names, parent/child relationships, transforms, skins and joint order, inverse-bind accessor hashes, per-primitive skin-weight normalization/influence statistics, joint-use counts, morph targets, animation tracks and interpolation, keyframe counts/time ranges, accessor hashes, triangle counts, static bounds, texture dimensions/encodings/hashes, and glTF names/extras/asset metadata.

The encoder retains the original JSON object indices and protected sections. It never simplifies, welds, quantizes, reorders vertices/triangles, or resamples animation. Meshopt compression uses lossless buffer encoding with no filters. Index buffers use `INDICES` mode to preserve their exact order. Compression is applied only when the result is smaller and a local encode/decode byte comparison succeeds. Unchanged non-image buffer views are compared byte-for-byte after the finished output is decoded.

Textures are resized within 1024 or 2048 pixels while preserving aspect ratio; smaller images are not enlarged. WebP is lossless after resizing, including material data textures. Sharp preserves image metadata. Without WebP, PNG remains lossless and resized JPEG uses quality 95 with 4:4:4 chroma. Existing texture fallback relationships are retained. KTX2/AVIF or other unsupported image encodings are preserved and explicitly reported; their dimensions may exceed the requested cap. Input images sharing a buffer view with accessor data are rejected.

Each output is validated both in its compressed form and as a decoded, uncompressed mirror. This is necessary because the installed glTF Validator reports `EXT_meshopt_compression` as unsupported. Errors prevent publishing variant GLBs; full warnings remain visible in reports. Existing input warnings are retained, rather than repaired by changing geometry or hierarchy. The output declares `EXT_meshopt_compression` and/or `EXT_texture_webp` as required when used, so its destination loader must support them.

Unsupported glTF extensions, external/data-URI resources, inaccessible compressed input, conflicting shared image encodings, and preservation-check failures are rejected explicitly. Source files remain untouched. Bounds describe static node transforms and do not include animation, skin deformation, or animated morph extrema. Texture caps are not triangle-count or GPU-memory guarantees.

## Verification

Run the integration fixture:

```sh
node /Users/nathaniel/Documents/ChatGPT/Knight/references/higgsfield-september-8-2026/tools/test-inspect-optimize-glb.cjs \
  /Users/nathaniel/.cache/ashen-september-deps
```

The fixture exercises two bones, a skin, exact weights/inverse binds, morph targets, two animation tracks, nested metadata, texture downsizing, default Meshopt/WebP output, and the PNG/uncompressed fallback. Test files are written only under this directory's `qa/rigged-fixture` folder. Both paths pass glTF validation with zero errors.

An existing Warden model was also read and converted under `qa/warden`: 20 bones, one skin, three animations, 180 tracks, and 10,692 triangles were retained. Its size decreased from 1,400,532 to 662,124 bytes (52.7% smaller), with zero validation errors. Both texture caps produce the same bytes because its source textures already fit the smaller cap. Its two original warnings (runtime tangent generation and a non-root skinned mesh) are preserved in the validator reports. Reinspection of the compressed model also passed. None of these tests changed the source model or a Site checkout.

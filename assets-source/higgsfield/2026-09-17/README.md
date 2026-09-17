# Higgsfield Ashen source assets

Current integration: optimized copies of all fifteen items are available in **Journal → Artwork**, with source/derivative hashes in `public/assets/ashen-archive/manifest.json`. Full-resolution originals below remain unchanged. The original import notes describe the state at import time.

## Original import receipt

Imported on September 17, 2026 from the connected Higgsfield workspace for
[BEXAI/Ashen](https://github.com/BEXAI/Ashen).

This snapshot contains the latest 15 completed **Ashen-related image/video
generations** at import time: 14 PNG images and one MP4, created September 7–9,
2026. Unrelated Nismo pet and other project generations were excluded. The
original download bytes are preserved without resizing, recompression, or
transcoding. Total size: 203,379,763 bytes (193.96 MiB).

These are source assets for future integration. Importing them does not change
active game textures, character models, title artwork, or runtime loading.
The trailer is generated concept footage, not a recording of this game's
runtime. Character images are reconstruction references, not rigged 3D models.
The three albedo images do not include measured normal, roughness, or metallic
maps. The flame atlas layout comes from its generation prompt and has not yet
been integrated or reviewed as a runtime animation.

Existing 3D Jutsu models and their provenance remain in
[`assets-source/higgsfield-jutsu`](../../higgsfield-jutsu/).

[manifest.json](manifest.json) records descending creation order, source job IDs,
original filenames and URLs, generation prompts/parameters, local paths,
measured file sizes, SHA-256 hashes, and decoded image/video metadata. The
character design sheet is the original for the existing cropped skin materials
recorded in `public/assets/skins/provenance.json` (job `a4887158-9444-42f8-9573-ce2581d8495e`).

| Order | Asset | Created (UTC) | Dimensions / duration | Size |
| --- | --- | --- | --- | --- |
| 1 | [Ashen Realm Gameplay Trailer](ashen-realm-gameplay-trailer--97671044.mp4) | 2026-09-09 | 1280 × 720, 10.0417 s | 10.17 MiB |
| 2 | [Ember Sovereign Hero Key Art](ember-sovereign-hero-key-art--82393442.png) | 2026-09-08 | 5504 × 3072 | 17.35 MiB |
| 3 | [Crypt Warden Photoreal Reference](crypt-warden-photoreal-reference--52bc1c7f.png) | 2026-09-08 | 3392 × 5056 | 21.25 MiB |
| 4 | [Ash Knight Photoreal Reference](ash-knight-photoreal-reference--681ce391.png) | 2026-09-08 | 3392 × 5056 | 23.99 MiB |
| 5 | [Ember Sovereign Photoreal Reference](ember-sovereign-photoreal-reference--3d191db7.png) | 2026-09-08 | 3392 × 5056 | 18.40 MiB |
| 6 | [Crypt Warden Skin Albedo](crypt-warden-skin-albedo--167484ba.png) | 2026-09-08 | 4096 × 4096 | 28.13 MiB |
| 7 | [Ember Sovereign Obsidian Albedo](ember-sovereign-obsidian-albedo--7f30eae7.png) | 2026-09-08 | 4096 × 4096 | 18.70 MiB |
| 8 | [Weathered Forged Steel Albedo](weathered-forged-steel-albedo--f578dfc0.png) | 2026-09-08 | 4096 × 4096 | 26.14 MiB |
| 9 | [Torch Flame Atlas](torch-flame-atlas--0268dca9.png) | 2026-09-08 | 1024 × 1024 | 0.97 MiB |
| 10 | [Ash Knight Character Reference](ash-knight-character-reference--cf54ea08.png) | 2026-09-08 | 1696 × 2528 | 4.35 MiB |
| 11 | [Crypt Warden Character Reference](crypt-warden-character-reference--c21de7ae.png) | 2026-09-08 | 1696 × 2528 | 4.82 MiB |
| 12 | [Ember Sovereign Character Reference](ember-sovereign-character-reference--ae5cf226.png) | 2026-09-08 | 1696 × 2528 | 4.97 MiB |
| 13 | [Crypt Warden Reconstruction Reference](crypt-warden-reconstruction-reference--70f171b8.png) | 2026-09-07 | 1696 × 2528 | 4.48 MiB |
| 14 | [Ember Sovereign Reconstruction Reference](ember-sovereign-reconstruction-reference--ad79d944.png) | 2026-09-07 | 1696 × 2528 | 4.47 MiB |
| 15 | [Ashen Realm Character Design Sheet](ashen-realm-character-design-sheet--a4887158.png) | 2026-09-07 | 2752 × 1536 | 5.76 MiB |

## Validation

All 15 downloads completed successfully. PNGs were opened and verified with
Pillow; the MP4 was inspected with FFprobe and fully decoded with FFmpeg.
Every manifest path, byte count, and SHA-256 digest was checked against the
imported file. The import adds source media and documentation only; no
application code or dependencies changed.

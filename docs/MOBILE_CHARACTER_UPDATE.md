> Historical Sovereign v10 delivery report. The counts/build/publication statements below describe the earlier implementation, not the current v11-character/v13-dungeon/v2-prop candidate. Current evidence and pending physical-device/build/deployment gates are in [RELEASE_PROVENANCE.md](RELEASE_PROVENANCE.md).

# Ember Sovereign mobile update

The v10 character manifest replaces the Ember Sovereign with fitted black armor, a spiked crown, orange eyes and chest fissures, oxblood drapes, and a cape. It adapts the project's detailed Blender source to the existing combat rig. The supplied Jutsu GLB was inspected separately: it is an unrigged, untextured blockout, so it could not supply the reference image's surface detail or the game's animation clips.

The detailed source is reduced from 580,034 evaluated triangles to three runtime levels. Only one level is visible at a time. The original weapon, 15 rig joints, 13 animation clips, and weapon sockets are preserved. Other characters retain their v9 assets.

| Mobile character metric | v9 | v10 |
| --- | ---: | ---: |
| Compressed download | 1,985,960 bytes | 2,193,044 bytes |
| PNG fallback download | 9,176,488 bytes | 3,024,256 bytes |
| Near triangles | 22,552 | 23,208 |
| Middle triangles | 12,402 | 14,241 |
| Far triangles | 8,938 | 7,777 |
| Material draws per visible level | 1 | 2 |

The compressed download grows 10.4% to support the new appearance; the fallback shrinks 67.0%, and far geometry shrinks 13.0%. Near geometry and material cost increase modestly. This is not a claim of uniformly lower rendering cost.

Mobile textures use 1K base color and 512px normal, packed metallic/roughness and emission maps. Smaller weapon maps are retained separately. KTX2 compresses color and data maps; lossless PNG emission preserves orange hues in thin cracks. Geometry uses Meshopt. The conservative RGBA8 texture allocation estimate including mipmaps is 9.85 MiB for Mobile and 2.85 MiB for Performance. Actual compressed GPU allocation depends on device format support. HD and Ultra use the actual 2K authored atlas.

Mobile Auto rendering now caps its initial render target at 800,000 pixels and a 1.25 resolution ratio, with existing adaptive scaling below that budget. CSS controls and explicit Full HD/4K selections remain independent.

## Verification

- All 83 automated checks pass, covering mobile resolution, touch controls, all eight character variants, source hashes, geometry budgets, independent actor cloning, finite skinning, and original strike socket trajectories.
- TypeScript, syntax checks, scoped application lint, and the production build pass.
- Khronos validation reports zero errors. Compressed variants retain 15 warnings: three existing non-root skin warnings and twelve validator limitations around the six KTX2 images. PNG fallback variants retain the same three skin warnings.
- Original animation channel sample bytes and joint/socket transforms match. Meshopt quantization changes inverse bind representation consistently; runtime weapon trajectory error remains below the 4 cm test tolerance.
- Offline renders inspect the authored rig at rest, moving forward, and at active side/overhead strike times, plus the far level. Final runtime KTX2 textures were decoded and rendered; their PNG emission is pixel-identical to the fallback. See `assets-source/sovereign-v10/qa/runtime-mobile/idle-front.png`.

No browser gameplay review or physical-phone frame-time measurement was performed. This is a practical rig retrofit; extreme poses and garment collisions can still benefit from art refinement. The preview is a neutral offline asset render, not an in-game screenshot.

## Rebuild

Editable source, provenance, and the modeling recipe are in `assets-source/sovereign-v10`. Runtime packaging is in `scripts/package-sovereign-mobile.mjs`; set `ASHEN_TOKTX` to Khronos toktx 4.4.2. Large source assets restore from tracked byte blocks during `npm run build`.

The production build includes only character files referenced by the active manifest. Superseded v8 character packages and v9 Sovereign packages remain in source for editing and regression checks, but are omitted from the deployment archive to meet the hosting size limit.

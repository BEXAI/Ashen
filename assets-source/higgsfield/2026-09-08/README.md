# Higgsfield sources — September 8, 2026

Preserved 17 original files from `/Users/nathaniel/Downloads/archive.zip`: **16 PNG images and one MP4 reference video**. Original filenames and bytes are unchanged. These are source references for playable 3D character/enemy conversion; the `models/` directory contains conversion inputs, original 3D exports, authored repairs, motion donors, and provenance. Optimized game-ready exports are under `public/assets/roster/september-8/`.

`source-screenshot.png` is an unchanged copy of the supplied screenshot. `source-manifest.json` records every source filename, complete asset ID, SHA-256, size, decoded dimensions, filename timestamp, timezone conversion and screenshot match. Descriptive labels below are visual inventory labels, not supplied character names.

All ZIP entries passed CRC validation and match the extracted originals byte-for-byte by SHA-256. All PNGs passed structural verification and full pixel decoding. The MP4 passed probing and full video/audio decoding: 854 × 480, H.264, 24 fps, 193 frames, 8.042 seconds, stereo AAC.

The filename prefix is interpreted as UTC (the name has no explicit timezone marker). Every original is dated September 9 in that prefix and September 8 after conversion to America/New_York (EDT, UTC−04:00), matching the screenshot heading. ZIP timestamps reflect downloading and are not used as creation dates.

| Screenshot | Asset ID prefix | Visual subject | Dimensions | New York time |
|---|---|---|---|---|
| R1C1 | `cd11e563` | Crowned armored figure video | 854 × 480 | 23:21:53 EDT |
| R1C2 | `496924e4` | Moss-covered stone golem | 1344 × 2016 | 22:35:57 EDT |
| R1C3 | `a732cfc0` | Gray-shrouded skeleton | 1344 × 2016 | 22:35:56 EDT |
| R1C4 | `db95c2d3` | Lion-surcoat knight | 832 × 1248 | 22:32:56 EDT |
| R1C5 | `6017ddf3` | Blue-crystal necromancer | 832 × 1248 | 22:32:56 EDT |
| R1C6 (partial) | `5a3ddbf0` | Chained ember dragon | 832 × 1248 | 22:32:56 EDT |
| R2C1 | `853d2fdc` | Hooded armored ranger | 832 × 1248 | 22:32:56 EDT |
| R2C2 | `880f9069` | Amber-staff wizard | 1792 × 2400 | 20:23:00 EDT |
| R2C3 | `5cbfe6bf` | Red-cape plate knight | 1792 × 2400 | 20:23:00 EDT |
| R2C4 | `0beed7ce` | Green-cape archer | 1792 × 2400 | 20:23:00 EDT |
| R2C5 | `e4f73d18` | Club-wielding troll | 1792 × 2400 | 20:23:00 EDT |
| R2C6 (partial) | `ae17a6dd` | Scythe-wielding reaper | 1792 × 2400 | 20:21:56 EDT |
| R3C1 | `4bbdba2a` | Skeleton shield warrior | 1792 × 2400 | 20:21:55 EDT |
| R3C2 | `c4010a07` | Mottled black spider | 2048 × 2048 | 20:21:55 EDT |
| R3C3 | `3e01be62` | Knife-bandolier rogue | 1792 × 2400 | 20:21:55 EDT |
| R3C4 | `3e9a9a70` | Purple-staff crowned lich | 1792 × 2400 | 20:21:55 EDT |
| R3C5 | `2cfd6662` | Cleaver-wielding goblin | 1792 × 2400 | 20:21:55 EDT |

The screenshot contains five complete columns across three rows, with a sixth partial column in the first two rows. Its bottom row is clipped. The visible sidebar badge `27` has no visible label; it is not evidence of this group’s total count.

The original PNGs remain unchanged. Derived GLBs contain full 3D geometry, weighted skeletons, and twelve animation clips. The original MP4 is available from the game’s Crown film menu. The bestiary uses the original enemy portraits, and the six hero portraits are available in character selection.

## Integration and provenance

Six playable heroes: Lion Knight, Dusk Rogue, Ember Sage, Silver Knight, Green Ranger, and Knife Rogue. The ten enemy references replace the ten existing dungeon encounters without changing their save IDs or chamber gates. Existing progress can switch heroes from Pause → Choose wanderer.

Higgsfield reconstructed fourteen source images. The ogre and goblin conversion requests were rejected by the provider; those two are separately authored interpretations of the same references, preserving their outfits, faces, and equipment. Their local geometry is not represented as a provider output or an exact reconstruction. The spider uses the generated original mesh with a locally authored eight-legged skin and motions.

Humanoid animation donors were generated with the official Higgsfield CLI. Retargeting uses bind rotations and target bone lengths, with no donor limb translations. Each class keeps genuine source animations; staff, bow, and claw actions are reused under the four gameplay attack names. Runtime sampling maps attack contact phases onto the game’s existing stamina and damage windows. Body-only grounding samples prevent the reconstructed robes and limbs from sinking through the floor during reactions.

Single-view reconstruction omitted several weapons. The game adds modeled swords/daggers, three crystal staffs, and the skeleton’s shield. The reaper’s existing scythe geometry is moved to its hand and rigidly weighted. The ranger’s bow and the dragon’s wings, tail, cuffs, and chains remain from the generated mesh. Automatic rigs have no individual finger bones; hands, cloth, wings, and tails can have simplified deformation.

`source-manifest.json` records exact untouched image/video hashes and screenshot positions. `conversion-plan.json`, `models/jobs/`, `models/provenance/`, and `models/animation-library-jobs.json` retain provider and authored provenance. `tools/` contains reconstruction, repair, retargeting, and optimization utilities. The runtime manifest lists the exact delivered mobile/HD hashes and source asset IDs. Large files are reconstructed losslessly by `npm run prebuild` from the repository’s existing chunk store.

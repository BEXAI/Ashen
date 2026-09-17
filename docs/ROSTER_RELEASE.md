# September roster and graphics follow-up

The September 8 screenshot is represented by six selectable heroes, ten enemies, sixteen journal/selection portraits, and the original crown film. The recovered September 9 meshes now replace fourteen matching appearances, including the textured Ogre and Goblin. Golem and Shrouded Dead retain their existing models. See [the recovered asset release](RECOVERED_ASSET_RELEASE.md) for source-bound replacement details and the September 17 Bone Throne.

The earlier fifteen Ashen imports are also available under Journal → Artwork: fourteen character studies/material images and one concept trailer. These are alternate art and reference media, not fifteen additional characters. Original full-resolution files remain in the GitHub source archive. Runtime display derivatives are bound to original and derivative hashes in `public/assets/ashen-archive/manifest.json`; the fifteen media files total 5,389,121 bytes. This gallery is mounted on demand, with lazy images and no automatic video download/playback.

## Graphics and game feel

The September roster inherits the previously shipped five chamber lighting profiles, local exposure/brightness settings, dungeon PBR materials, Higgsfield sconces/shrines/architecture, staged mobile Auto, pooled combat feedback, directional telegraphs and collision-safe camera. Those earlier implementation records remain historical evidence in `visual-upgrade/`.

This follow-up adds bounded pose transitions for the imported skeletons. Pure combat sampling is restored before every sample, and active strikes retain their exact authored pose/socket positions. Signed floor correction fixes floating walk/attack poses while retaining dodge, hit and death lift. Staff bolts launch from the evaluated crystal, and the ranger uses the bow hand. Ranged aim remains locked forward, respects range and walls, and damages one nearest target per release. Static weapon details are merged by material per hand; staff equipment takes three mesh draws instead of five, and shield fittings share draws.

## Mobile Safari resource controls

Models load serially; living enemies load within 36 m and remain resident until 52 m to prevent boundary reload churn. Hidden old-tier models are released during quality changes. Hidden/stale downloads are discarded before decoding when possible. Only scene and animation data are retained after loading, allowing GLTF parser/BIN caches to be collected.

Performance mode caps roster textures to 512 pixels before GPU upload, closing superseded decoded bitmaps. Compared with a 1024-pixel texture of the same aspect/format, this quarters the texture pixel allocation. It does not reduce network download size or eliminate the transient original decode. Mobile Auto continues to use 1024-pixel assets, while desktop uses 2048. Most recovered meshes use a single geometry level; the spider has a reduced 24,005-triangle mobile derivative and a 57,158-triangle HD derivative. Embedded equipment is not duplicated by legacy game-authored equipment. These are limits, not claims of measured phone performance. Diagnostics identify the actual roster characters and tiers.

Existing mobile safe areas, independent multi-touch controls, RAF scheduling, paused/background rendering suspension, context-loss recovery and staged Auto remain in place. Physical iPhone Safari frame times, touch comfort, thermal behavior and a prolonged device soak have not been verified. No guaranteed device FPS is claimed.

## Verification and publication

Automated coverage checks all seventeen screenshot originals, thirty-two GLB hashes, independent skeletons, reachable melee contacts, transitions and pure-pose restoration, floor placement, ranged muzzles, streaming hysteresis/quality changes, parser release, shared texture reduction, and all fifteen archive display hashes. Existing save, API, combat, world, controls and graphics regressions also run, with TypeScript, scoped lint and a production build. The terminal publication receipt is retained outside the source checkout to bind the final source SHA, archive hash and successful deployment without a self-referential commit.

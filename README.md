# Ashen Realm — The Hollow Crypt

A solo, five-chamber dungeon RPG built with React, TypeScript, Three.js and Cloudflare Workers/D1. This is real-time WebGL, not an Unreal Engine build or an AAA fidelity claim.

## Dungeon runs

Start a new run or continue the saved one. Speak to the Keeper in the Threshold, then descend through Cinder Crypt, the Ossuary and Chapel of Ash to the Hollow Throne. Each of the three progression seals requires defeating its chamber's three wardens and awakening its shrine. Defeat the Hollow King to clear the dungeon. Loot four relic caches, strengthen armor and blade, and rest at shrines between encounters. Starting another run retains the existing explicit confirmation before replacing a save.

The world has enclosed rooms, connected corridors, vaulted ribs, burial niches, iron gates, a throne, torchlight, and shallow reflective water. The map shows the actual floor plan, current chamber, enemies, shrines and gate states. Wall collision applies to movement, enemy navigation, camera placement, melee and spell line of sight. Existing character equipment and rewards are retained; old positions outside the dungeon or behind an uncleared seal resume at the entrance.

## September 8 character roster

The screenshot’s exact sixteen images are represented by six playable heroes and ten dungeon enemies; its original video is available from **Crown film**. Choose a hero when starting a run, or use **Pause → Choose wanderer** to change the current hero without losing progress. The ranger fires arrows and staff users cast bolts. Enemy portraits appear in the journal’s **Bestiary**.

Fourteen images were reconstructed through Higgsfield. Ogre and goblin are locally authored, stylized interpretations because the provider rejected those inputs. All sixteen use weighted 3D meshes and twelve animation clips; the spider has its own eight-legged rig. Missing equipment was modeled, and the reaper’s original scythe was rebound to its hand. [Source inventory and provenance](assets-source/higgsfield/2026-09-08/README.md) records exact screenshot positions, untouched original hashes, generation jobs, and authored limitations.

The earlier fifteen Ashen imports are available from **Journal → Artwork**, including character studies, material sheets and the concept trailer. The graphics follow-up smooths pose changes, grounds attacks, attaches beams to weapons, and lowers roster texture memory in Performance mode. [Release details and limits](docs/ROSTER_RELEASE.md).

## Controls

WASD/arrows move; drag the world to look; J/left click strikes; Q casts; Space dodges; Shift sprints; R heals; E interacts; I opens inventory; Tab opens the map; Escape pauses.

On iPhone, move with the left pad and push it to the edge to sprint. Tap or hold Strike to attack; tap Ember, Dodge or Heal for other actions. Independent pointer ownership supports movement and combat together. Controls clear screen safe areas in portrait and landscape. Input resets on cancellation, pause, rotation or focus loss. Menus accommodate the software keyboard. Action buttons are 64–80 CSS pixels, with 56–68 pixel buttons in very short landscape viewports. Joystick bounds are cached per gesture, thumb painting is batched to animation frames, and Safari toolbar resizing no longer cancels movement. Both orientation changes and interrupted gestures release all held actions.

## Graphics and open-source packages

- Three.js 0.180.0 (MIT): PBR materials, physical metal/cloth shading, PMREM RoomEnvironment reflections, dynamic shadows, GTAO contact shading, bloom, ACES tone mapping and FXAA. Existing Three.js addons are reused rather than adding overlapping render frameworks.
- three-mesh-bvh 0.9.14 (MIT): a BVH over merged dungeon architecture accelerates camera and combat visibility raycasts. See https://github.com/gkjohnson/three-mesh-bvh .
- Poly Haven (CC0): monastery_stone_floor and stone_tile_wall. Color, OpenGL normal and packed ambient-occlusion/roughness maps are checksum-verified against the source API and shipped locally at 4096×4096, 2048×2048 and 1024×1024. Source pages: https://polyhaven.com/a/monastery_stone_floor and https://polyhaven.com/a/stone_tile_wall .

New touch-device sessions default to Auto; explicit saved preferences are retained, even when 4K was selected on a phone. Blocked preference storage also falls back to Auto on touch devices. Desktop defaults to 4K Ultra.

| iPhone setting | Render limit | Masonry maps | Contact shading / water reflections | Shadows / point lights |
| --- | --- | --- | --- | --- |
| Auto | 0.8M output pixel budget, at most 1.25 output pixels per CSS pixel; adapts down to 65% scale | 1K | Off / off | 512 px / 3 |
| Performance | Up to 1280×720 pixel budget | 1K | Off / off | Off / 3 |
| Full HD | Up to 1920×1080 pixel budget | 2K | Off / off | 512 px / 3 |
| 4K Ultra | Up to 3840×2160 pixel budget | 4K floor color; 2K wall/data maps | On / on | 2048 px / 6 |

Output respects aspect ratio and hardware texture/renderbuffer limits. Desktop Full HD retains contact shading and reflections. FXAA runs outside Performance mode; Auto may reduce bloom under sustained load; canvas MSAA is disabled to avoid stacking it with FXAA. GPU rendering is paced at up to 60 frames per second, stops while paused except for requested redraws, and stops completely while hidden. Auto uses eligible frame windows to reduce optional effects, shadow detail and resolution before selecting 30 FPS; recovery uses sustained headroom and bounded 60 FPS probes. Paused, hidden, loading and upload-warmup time do not masquerade as steady rendering measurements. Frame rate is a target, not a measured device guarantee.

Wall geometry is merged, masonry edging is instanced, light selection runs four times per second, and distant wardens skip animation. Safari viewport changes resize buffers after a short debounce. If WebGL is interrupted, the recovery dialog can rebuild the renderer in Performance mode from the current character snapshot. Level, loot, position and completed objectives are retained; surviving enemies restart at their spawn with full health, as when loading a save. WebGL 2 is required. The 4K label describes rendering resolution, not ray-traced Unreal Engine output.

The cinematic title illustration depicts the keep above the dungeon. It is not a gameplay screenshot. Current Poly Haven terrain texture derivatives and the Three.js water-normal asset remain included; unused original terrain JPEGs and the old sky HDR were removed. Third-party notices are in public/THIRD_PARTY_NOTICES.txt.

## Saves and backend

The progress API supports anonymous guest cookies and existing signed-in account saves. Guest tokens have 256 bits of entropy; only SHA-256 owner keys are stored in D1. Secure, HttpOnly, SameSite=Lax cookies bind guest saves to the browser. Owner isolation, bounded Zod validation, prepared SQL and optimistic revision checks remain in place. New runs require confirmation before replacement, and equipment prices are enforced on the server. Combat is client-side for solo play, not a competitive anti-cheat system.

Autosave runs every 18 seconds, at milestones and when pausing/leaving. Concurrent triggers share one request and a latest-state follow-up, with equipment purchases serialized against saves. Graphics restart retains a CPU-side snapshot for saving even while the renderer is unavailable. There is no browser-storage fallback for gameplay progress; local storage holds graphics/audio preferences only. Existing D1 schema and migrations are unchanged. Platform access is separate from application guest support and is managed by Sites; this update does not change the existing access policy.

## Dungeon visual overhaul

The active character manifest is `public/assets/characters/v11/manifest.json`. Ember Sovereign now uses the detailed Blender model with a spiked crown, fitted black armor, narrow molten chest fissures, oxblood drapes and cape. The other two characters retain their v9 assets. All 15 original rig joints, 13 animation clips and sword sockets are retained; the runtime rejects incomplete animation sets before replacing an actor.

Mobile loads 1K base color with smaller normal, metallic/roughness and emission maps; Performance uses a 512px base map. Base color and data textures use KTX2, orange emission stays lossless PNG, geometry uses Meshopt, and PNG fallback files stay within the same mobile texture-memory cap. HD and Ultra share the actual 2K authored master instead of upscaling it; explicit 4K render output remains available. The new body and retained weapon use two material draws per visible LOD.

The original v10 foundation remains in `assets-source/sovereign-v10`; the integrated shoulder/cape refinement, editable source and pose evidence are in `assets-source/sovereign-v11`. Only the authored dodge cape channel changes; strike/contact tracks and the named 15-joint/13-clip/socket contract are retained. This is a mobile interpretation of the reference with a practical rig retrofit, not an exact photoreal reconstruction. Physical iPhone/Android performance remains unmeasured.

The active environment manifests are `public/assets/props/v2/manifest.json` and `public/assets/dungeon/v13/manifest.json`. Original Higgsfield A01 sconces, A02 shrines and A03 architectural trim share baked atlases and keep existing world flames, lights, interaction IDs and gate/collision rules. The three prop fallback atlas sets total 14.33332 MiB of full-mip RGBA8 storage; runtime family budgets cap new imported props at 10 main-pass draws and 25,000 triangles. These are policies and measured asset storage, not guaranteed phone frame rates.

Dungeon v13 preserves the v11 UV1/indirect lightmaps and removes matched legacy visual fixtures replaced by imported architecture. Its manifest intentionally references older unchanged files. Release build pruning follows those exact URLs and external GLB dependencies, while keeping editing masters in source storage.

The earlier dungeon overhaul passed its production build and 188 automated tests; the current roster follow-up adds its own regression coverage. Exact saved-version/deployment linkage is recorded in the terminal publication receipt; physical iPhone 17 Safari measurements remain pending. Existing screenshots and timed reference samples were taken in desktop Chromium; they do not verify Safari performance, thermal stability or battery use. See [release provenance](docs/RELEASE_PROVENANCE.md) and [device results](docs/visual-upgrade/device-results.json).

## Verification

Use the configured Sites install/build scripts. npm run typecheck checks TypeScript. npm run check:syntax checks authored and compiled JavaScript. node --test tests/*.test.mjs checks saves, combat, resolution, touch ownership, dungeon connectivity, gate rules, wall sliding, real BVH occlusion, render-loop lifecycle, adaptive quality, graphics switching, disposal and queued saves. Source lint: node_modules/.bin/eslint app db worker --max-warnings 0. The earlier Safari implementation audit is retained as historical evidence in [docs/SAFARI_AUDIT.md](docs/SAFARI_AUDIT.md). Current scope and limitations are recorded in [docs/ROSTER_RELEASE.md](docs/ROSTER_RELEASE.md). Browser or physical-device testing is separate from these automated checks.

## Earlier source import

The original fifteen Ashen-related Higgsfield sources remain unchanged in [the September 17 source import](assets-source/higgsfield/2026-09-17/README.md). Optimized display copies are now available from **Journal → Artwork**, separately from the screenshot-matched September 8 playable roster.

## Asset audit and next update

The [September 17 audit](docs/ASSET_AUDIT_2026-09-17.json) records removed obsolete files and preserved sources. The [asset update plan](docs/ASSET_UPDATE_PLAN.md) covers fourteen recovered cloud character meshes, the Bone Throne, and optional source studies. These candidates are not activated by the cleanup.

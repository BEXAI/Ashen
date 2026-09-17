# Ashen Realm — The Hollow Crypt

A solo, five-chamber dungeon RPG built with React, TypeScript, Three.js and Cloudflare Workers/D1. This is real-time WebGL, not an Unreal Engine build or an AAA fidelity claim.

This repository recovers the verified version 7 source and integrates all five
available Ashen Higgsfield 3D Jutsu environment models. See
[source recovery and integration](docs/SOURCE_RECOVERY.md) for provenance,
validation, and the limitation that later published versions have not been recovered.

## Dungeon runs

Start a new run or continue the saved one. Speak to the Keeper in the Threshold, then descend through Cinder Crypt, the Ossuary and Chapel of Ash to the Hollow Throne. Each of the three progression seals requires defeating its chamber's three wardens and awakening its shrine. Defeat the Hollow King to clear the dungeon. Loot four relic caches, strengthen armor and blade, and rest at shrines between encounters. Starting another run retains the existing explicit confirmation before replacing a save.

The world has enclosed rooms, connected corridors, vaulted ribs, burial niches, iron gates, a throne, torchlight, and shallow reflective water. The map shows the actual floor plan, current chamber, enemies, shrines and gate states. Wall collision applies to movement, enemy navigation, camera placement, melee and spell line of sight. Existing character equipment and rewards are retained; old positions outside the dungeon or behind an uncleared seal resume at the entrance.

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
| Auto | 1600 px longest edge, at most 2 output pixels per CSS pixel; adapts down to 65% scale | 1K | Off / off | 512 px / 3 |
| Performance | Up to 1280×720 pixel budget | 1K | Off / off | Off / 3 |
| Full HD | Up to 1920×1080 pixel budget | 2K | Off / off | 512 px / 3 |
| 4K Ultra | Up to 3840×2160 pixel budget | 4K | On / on | 2048 px / 6 |

Output respects aspect ratio and hardware texture/renderbuffer limits. Desktop Full HD retains contact shading and reflections. Bloom and FXAA run outside Performance mode; canvas MSAA is disabled to avoid stacking it with FXAA. GPU rendering is paced at up to 60 frames per second, stops while paused except for requested redraws, and stops completely while hidden. Sustained slow frames lower Auto resolution; isolated stalls and time spent in the background do not. Frame rate is a target, not a measured device guarantee.

Wall geometry is merged, masonry edging is instanced, light selection runs four times per second, and distant wardens skip animation. Safari viewport changes resize buffers after a short debounce. If WebGL is interrupted, the recovery dialog can rebuild the renderer in Performance mode from the current character snapshot. Level, loot, position and completed objectives are retained; surviving enemies restart at their spawn with full health, as when loading a save. WebGL 2 is required. The 4K label describes rendering resolution, not ray-traced Unreal Engine output.

The cinematic title illustration depicts the keep above the dungeon. It is not a gameplay screenshot. Existing Poly Haven terrain/sky assets and the Three.js water-normal asset remain included. Third-party notices are in public/THIRD_PARTY_NOTICES.txt.

## Saves and backend

The progress API supports anonymous guest cookies and existing signed-in account saves. Guest tokens have 256 bits of entropy; only SHA-256 owner keys are stored in D1. Secure, HttpOnly, SameSite=Lax cookies bind guest saves to the browser. Owner isolation, bounded Zod validation, prepared SQL and optimistic revision checks remain in place. New runs require confirmation before replacement, and equipment prices are enforced on the server. Combat is client-side for solo play, not a competitive anti-cheat system.

Autosave runs every 18 seconds, at milestones and when pausing/leaving. Concurrent triggers share one request and a latest-state follow-up, with equipment purchases serialized against saves. Graphics restart retains a CPU-side snapshot for saving even while the renderer is unavailable. There is no browser-storage fallback for gameplay progress; local storage holds graphics/audio preferences only. Existing D1 schema and migrations are unchanged. Platform access is separate from application guest support; the existing Site audience is managed by Sites and is not changed by publishing this source repository.

## Verification

Use the configured Sites install/build scripts. npm run typecheck checks TypeScript. npm run check:syntax checks authored and compiled JavaScript. node --test tests/*.test.mjs checks saves, combat, resolution, touch ownership, dungeon connectivity, gate rules, wall sliding, real BVH occlusion, render-loop lifecycle, adaptive quality, graphics switching, disposal and queued saves. Source lint: node_modules/.bin/eslint app db worker --max-warnings 0. The audit and its limitations are recorded in [docs/SAFARI_AUDIT.md](docs/SAFARI_AUDIT.md). Browser or physical-device testing is separate from these automated checks.

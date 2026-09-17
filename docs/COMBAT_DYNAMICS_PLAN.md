# Ashen Realm — combat dynamics update

## Goal and scope

Give the existing 3D characters readable, weighty melee motion while preserving
the solo dungeon, equipment, progression, saves, and Safari/iPhone controls.
The implementation below is complete in source. Publication is a separate step;
this document is not evidence that the live game has been updated.

These are authored, quaternion-blended animations on the existing procedural
character meshes, not motion-capture clips, physics simulation, or newly imported
Higgsfield 3D models. Real-device playtesting remains necessary to judge feel.

## 1. Four-strike moveset — implemented

All timings are seconds. Damage multiplies the character's equipment-based
melee damage, rounded to a whole number. Stamina is paid when a swing starts.

| Strike order | Wind-up | Contact | Recovery | Stamina | Damage | Max targets | Warden stagger |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Side cut | 0.17 | 0.16 | 0.25 | 8 | 1.00× | 2 | 0.16 |
| Diagonal cut | 0.23 | 0.18 | 0.27 | 10 | 1.15× | 2 | 0.22 |
| Backhand | 0.15 | 0.16 | 0.25 | 8 | 0.95× | 2 | 0.14 |
| Overhead strike | 0.34 | 0.20 | 0.37 | 15 | 1.55× | 1 | 0.42 |

- The waist drives the turn, with separate shoulder, elbow, and wrist motion.
  The offhand balances the attack; small knee bends and footwork support it.
- Each attack anticipates, accelerates through contact, follows through, and
  returns to guard. The overhead has the longest preparation and recovery.
- Contact-phase forward travel is 0.16 / 0.23 / 0.12 / 0.30 world units,
  respectively. Dungeon collision constrains it.
- A short, low-opacity ribbon follows the actual weapon, not a detached circle.
  Hits add sparks, recoil, sound, and a 35 ms impact pause. Reduced-motion
  preferences disable the trails and impact pause.

## 2. Input, commitment, and resource rules — implemented

- Tap Strike, press J, or click to attack. Successive attacks cycle through the
  four moves. Holding the iPhone Strike button continues the chain.
- One input can be buffered for 200 ms. Tapping late in recovery queues the next
  attack; tapping early does not create a long backlog of future swings.
- A gap longer than 800 ms after recovery resets the chain to the side cut.
- Aim assistance selects a visible, nearby target in the forward hemisphere.
  Direction locks for that swing; movement cannot redirect the blade mid-cut.
- Melee movement is 45% of normal speed in wind-up/recovery and 25% during
  contact. Sprinting is unavailable during a swing.
- Stamina regenerates at 6 units/second during melee and 18 when not swinging.
  An attack never starts without its full stamina cost.
- Dodge costs 25 stamina. It may cancel wind-up or recovery, but not the active
  contact phase. Cancelling never refunds the attack's stamina.
- Casting and melee cannot overlap. Healing, equipment, and save formats retain
  their existing behavior.
- Releasing Strike stops continuous attacks but preserves a deliberately queued
  tap. Pointer cancellation, lost ownership, pause, and input reset clear the
  buffer and held state. Death and respawn clear the combat sequence.

## 3. Contact authority and enemy behavior — implemented

- Button presses do not deal instant melee damage. Only the active contact
  window can hit, using the same articulated weapon pose that is rendered.
- Weapon positions are sampled at intervals no greater than 1/120 second within
  each frame's active interval. A slow frame does not skip the whole hit window.
- The blade segment is tested against body capsules. A target can be hit only
  once per swing, up to the move's target limit.
- Existing BVH wall checks reject obstructed attacks. Blade reach is clipped at
  walls, and targets behind the player are excluded from assisted player hits.
- Enemies use all four moves, with locked facing and a visible wind-up ring.
  Wardens prepare for 0.55 seconds; the boss prepares for 0.80 seconds. These
  longer telegraphs give players time to move or dodge.
- Wardens can be interrupted during wind-up or recovery. An active strike stays
  committed. The boss retains stagger resistance and its shrine-unlock shield.
- Warden recoil is constrained by dungeon collision. Enemy approach distances
  match the actual mace/greatsword reach, including the taller boss model.
- Moving beyond the animation range cancels stale enemy swings. Re-entering
  combat cannot resume an old invisible wind-up.

## 4. Mobile and lifecycle budget — implemented

- No additional texture families, lights, or postprocessing passes.
- Existing shared 512 px skin textures remain unchanged. Character geometry
  remains 9,480 / 15,932 / 10,024 triangles for knight / warden / boss.
- Joint separation increases model mesh counts to 27 / 32 / 31. Tests cap each
  model at 36 meshes and 17,000 triangles to prevent accidental regressions.
- Each actor owns one reusable trail: 24 vertices, 66 indices, fixed buffers.
  Performance mode hides trails; disposal releases their buffers and material.
- Safari adaptive resolution, safe areas, independent touch pointers,
  background/pause suspension, and renderer recovery are retained.
- Existing hit particles still allocate small meshes. Pooling them is a future
  optimization if device profiling identifies them as a bottleneck.

## 5. Validation and release gates

Automated coverage includes:

- Four-move order, stamina costs, buffering, expiry, and cancellation.
- Contact-window boundaries and consistent total travel at 20/30/60/120 FPS.
- Capsule intersections, misses, parallel and degenerate segments.
- Distinct continuous trajectories, grounded stationary feet, finite transforms,
  and return to guard.
- All four player strikes reaching a front target; all four enemy strikes
  reaching a player-height target at each enemy's approach distance.
- No instant wind-up damage, repeated damage, behind-player targeting, or
  through-wall melee damage; dodge commitment and cancellation rules.
- Trail lifetime/cleanup and the existing dungeon, save, mobile, and asset tests.

Before delivery: run the complete regression suite, TypeScript checking, source
and generated JavaScript syntax checking, and the production build. Save the
verified source commit and packaged Site version together.

Verification record, 7 September 2026:

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`) | Passed |
| Complete regression suite (`node --test tests/*.test.mjs`) | 55 passed; 0 failed |
| Syntax (`npm run check:syntax`) | 28 source files and 14 compiled modules passed |
| Production build | Passed |
| Whitespace/conflict checks (`git diff --check`) | Passed |
| Browser and physical iPhone playtesting | Not performed |

The build still reports a large client-chunk warning and forward-looking Vite
config warnings. These are not build failures, nor evidence of measured mobile
performance. This update does not change dependencies.

Before claiming device-ready combat, perform the following manual acceptance
pass. This has not been performed by the code-only checks:

1. On Safari/iPhone, test portrait and landscape while moving, steering, tapping,
   and holding Strike with separate fingers. Check toolbar resizing and app
   background/resume during wind-up, contact, and recovery.
2. Inspect all four moves at normal speed and slow playback. Check hand grip,
   shoulder clearance, foot sliding, blade-wall intersection, and readability
   under dungeon lighting. Numerical continuity does not replace visual review.
3. Fight a single warden, a group, and the boss. Dodge each telegraph; test empty
   stamina, interrupted combos, death, respawn, and closed progression gates.
4. Profile Auto and Performance graphics on a representative older iPhone and a
   recent model. Target responsive 30 FPS on the older device; measure actual
   frame times and thermal behavior before claiming that target is met.
5. Publish the saved version when requested. If a regression appears, redeploy
   the preceding known-good Site version; no save-schema migration is needed.

## 6. Follow-up mechanics, after playtesting

Tune timings and costs from playtest evidence first. Optional later increments
are explicit heavy-attack selection, parry/block, enemy feints, attack variants
for different weapons, particle pooling, and foot placement/IK. Each requires
its own balance, input-accessibility, and performance acceptance pass; none is
silently included in this update.

## Source map

| Concern | File |
| --- | --- |
| Strike data, sequence, timing, capsule math | `app/game/combat.ts` |
| Key poses, blending, weapon sampling, ribbon | `app/game/combat-animation.ts` |
| Articulated character hierarchy | `app/game/character-skins.ts` |
| Movement and guard animation | `app/game/world.ts` |
| Player/enemy state and damage integration | `app/game/engine.ts` |
| Touch ownership and control help | `app/game/TouchControls.tsx`, `app/game/Game.tsx` |
| Combat regression tests | `tests/combat.test.mjs`, `tests/game.test.mjs` |
| Geometry and texture budget | `tests/character-skins.test.mjs` |

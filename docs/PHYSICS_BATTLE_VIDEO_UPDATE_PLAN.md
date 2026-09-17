# Ashen physics and battle mechanics — implementation handoff

**Status: ready for implementation, independently reviewed, 17 September 2026. This task changes documentation only.**

Build more readable and consistent close combat: deliberate wind-ups, physically constrained movement, reliable moving contacts, visible avoidance windows, and a boss whose fire attacks announce their danger. Use Ashen's existing recovered characters, dungeon and progression. The work below is a mechanics update, not another asset replacement.

## 1. Read this first

The two supplied clips received **four complete frame-by-frame visual passes each**, split among the primary agent and three specialist agents: overview, physics, battle, and adversarial/Ashen mapping. Every decoded frame was included on consecutive contact sheets; selected frames were also expanded. This was visual inspection, **not continuous audiovisual playback**. Audio was not reviewed and no lesson below depends on it.

Treat both clips as illustrative combat references, not gameplay telemetry. V1 has duplicated controls and contradictory health strings; V2's original filename contains `generated_video`, with morphing weapons and persistent/duplicated damage labels. Visible motion is useful; internal algorithms, input causality, health arithmetic, critical odds, successful parries and immunity cannot be recovered reliably.

All new numeric rules below are **proposed Ashen tuning**, not measurements from the clips. Timing observations are approximate visual boundaries at 24 fps (at least ±1 frame, 41.7 ms, and more where effects obscure contact).

### Sources and completed review ledger

| Source | Retrieved media and coverage | Pass 1 | Pass 2 | Pass 3 | Pass 4 |
|---|---|---|---|---|---|
| [V1: corridor/minotaur duel](https://share.icloud.com/photos/027tMrrBSWfqw1SeFFqWN8iIg) | iCloud playback rendition, 720×1280, 10.000 s, 240 frames; not claimed original | [Overview](mechanics-video-review/video-1/pass-1-overview.md), primary agent | [Physics](mechanics-video-review/video-1/pass-2-physics.md), physics agent | [Battle](mechanics-video-review/video-1/pass-3-battle.md), combat agent | [Mapping](mechanics-video-review/video-1/pass-4-ashen-mapping.md), primary agent |
| [V2: fiery boss encounter](https://share.icloud.com/photos/047_2GybbP5zKfucdIKwjr_Eg) | Original MP4, 720×1280, 30.083333 s, 722 frames | [Overview](mechanics-video-review/video-2/pass-1-overview.md), source agent | [Physics](mechanics-video-review/video-2/pass-2-physics.md), physics agent | [Battle](mechanics-video-review/video-2/pass-3-battle.md), combat agent | [Mapping](mechanics-video-review/video-2/pass-4-ashen-mapping.md), primary agent |

V1 SHA-256: `379f0e15c2545b21d6780c64d25b6fc97b38f0d7aabaefde64833d2a0287dee4`.
V2 SHA-256: `3920cdc537dc69baf3559c8bf9fbd36b906dd814cfa876afcc3e7f864c42af51`.

The [independent review record](mechanics-video-review/independent-review.md) records design corrections and documentation checks. The portable [source catalog](mechanics-video-review/source-catalog.json) records paths, hashes and coverage. Raw media and all frames remain outside the repo at `/Users/nathaniel/Documents/ChatGPT/Knight/references/mechanics-video-review/`; do not ship them in `public/`. In V1, filenames/notes use one-based frames 1–240. V2 sheet labels use zero-based F0000–F0721; its PNG filenames are one-based. The two supplied stills match the opening scenes and are references, not additional videos.

### Evidence → design decisions

| ID | Visible evidence | Interpretation and limitation | Ashen decision |
|---|---|---|---|
| E1 | V1 0.750–1.458 and 2.333–3.458: raised preparation, torso-level blade path, sparks, follow-through. V2 6.250–7.500 and 21–22.500 repeats this structure. | Attack phases are visually legible. Actual button latency and active frames are unknown. | Preserve and strengthen one phase timeline for animation, root travel and hit admission. Do not replace existing contact geometry with a proximity timer. |
| E2 | V1 1.250–1.458 and 5.708–6.500; V2 13.333–14.500: local impact flash and upper-body reaction. | Impact/recoil sells weight; force and mass are unmeasured. | One accepted-hit event drives health, bounded recoil, effects and numbers. Add constrained recoil velocity, not free ragdoll physics. |
| E3 | V1 7.750–10.000: finishing blow, falling body, dust, grounded body remaining in view. | Victory text starts before the fall is complete; not proof of reward logic. | Kill once, stop combat immediately, settle death animation above the floor, and let current progression decide victory. |
| E4 | V2 approximately 3.958–6.208: bright floor patch then a rising flame column. | A warning interpretation is plausible, but not proven; no reliable damage interval. | Explicit warning → active → expiry hazard with a world-space footprint. Decorative fire never damages. |
| E5 | V2 17.208–19.958: hero lowers torso beneath a broad claw motion; 27–30.083 shows retreat/low posture under downward fiery attacks. | Evasion is visually suggested; success, crouch hitboxes and i-frames are unproven. | Improve the existing dodge action and its animation; define its protection window independently of movement. No new crouch/parry control. |
| E6 | V2 26–30.083: arm/flame blade-like form rises and strikes toward floor. | Distinct preparation implies an opportunity to move. The weapon morphs; it is not a stable asset or proven boss phase. | Adapt to a claw/body slam on the existing Hollow King dragon, with committed aim, a footprint, and recovery. |
| E7 | Both clips keep the main actors prominent, but V2 flashes and text obscure attacks; V1 duplicates maps/Attack controls. | Readability matters; the literal HUD is unsuitable. | Bounded encounter framing, short-lived truthful feedback, readable ground warnings, and Ashen's existing controls. |
| E8 | V1 labels regress from percentage-like strings back to 755/1000; V2 critical/damage labels persist, morph and stack. V2 ends mid-encounter. | Damage, critical formulas, input schedules and V2 defeat are unsupported. | Reject copied numbers, random critical rules, phantom hit counts and video-time-triggered victory. |

## 2. Verified baseline and scope

Audited GitHub checkout: `/Users/nathaniel/Documents/ChatGPT/Knight/Ashen`, HEAD `459759d98c7c51fab23177f0ee199fef7a16dca5`. Corresponding released Site source: `/Users/nathaniel/Documents/ChatGPT/Knight/Ashen-current`, commit `c02596d40c7bdddb33bdff3b0018c971e9615484` (Sites v17). Recheck HEAD and working tree before implementing. Do not overwrite either checkout from the other blindly.

Read the detailed [physics audit](mechanics-video-review/current-physics-audit.md) and [combat audit](mechanics-video-review/current-combat-audit.md). They were written before media review and contribute code facts only. Their source-unavailable statements describe that earlier audit stage. `COMBAT_DYNAMICS_PLAN.md` is historical: the current roster is skinned, particle pooling already exists, and its old geometry budgets are obsolete.

| Existing behavior | Required change / preservation | Main seam |
|---|---|---|
| One variable update per rendered frame, dt capped at 50 ms | Separate simulation ticks from rendering; specify overload and hit-stop policy | `app/game/engine.ts` `frame`, `app/game/mobile-runtime.ts` |
| Direct XZ movement, shared 0.45 square footprint, axis endpoint sliding | Swept circle controller, explicit sizes, acceleration and constrained recoil | `app/game/dungeon.ts`, engine movement |
| No solid player/enemy bodies; soft enemy separation only while approaching | Deterministic body spacing during every living state | engine AI/movement |
| Actual articulated blade segments sampled at ≤1/120 s, but current final roots/targets used for all samples | Reconstruct each sample's attacker and target motion | engine `sweep`/contact, `app/game/combat.ts` |
| Four strikes, 200 ms buffer, 800 ms combo reset, stamina and cancellation already implemented | Retain the foundation and initial attack balance; centralize new action rules | `combat.ts`, engine input/actions |
| All dodge time protects; respawn reuses dodge timer and therefore dodge speed | Separate movement, dodge protection and spawn protection | engine `dodge`, `hurt`, `respawn` |
| Enemy approaches and repeats four strikes; boss has shrine shield | Add distinct dragon sweep/slam/eruption patterns after shield removal | engine AI, `character-roster.ts` |
| Dead actor sinks below floor | Grounded finite death animation and bounded corpse lifetime | engine dead update, `roster-assets.ts` |
| Camera ray protects center only | Improve encounter framing; add bounded near-plane clearance | engine camera/obstruction, `camera-feedback.ts` |

Preserve six selectable heroes, ten enemy/save identities, all recovered meshes, Bone Throne, shrine/gate conditions, current ranged identities, save ownership/revision/run-ID protections, independent skeletons and loading fallbacks. Current hitscan bow/staff and Q spell remain hitscan/immediate; the references do not justify ballistic projectiles. Do not add jumps, slopes, ragdolls, a full rigid-body dependency, random crits, a poise meter, a new boss identity or a separate block/parry system in this update.

## 3. Authoritative simulation contract

### Clock and state ownership

Use the existing custom controller and Three.js stack. Extract testable modules without replacing all of `engine.ts` at once. Time is seconds; positions/speeds use existing world units. Do not infer real metres or mass from the clips.

- Simulation step: **1/60 s**. Render at the existing 30/60 FPS pacing; interpolate presentation with accumulator alpha. At 120 Hz input/render testing, some frames naturally run zero ticks.
- Accept at most **100 ms of foreground elapsed time per render** and run at most **six fixed ticks**. Preserve the fractional accumulator remainder. Count elapsed time beyond the 100 ms admission limit as `droppedTime`; never build an unbounded catch-up backlog. A 250 ms stall intentionally drops approximately 150 ms; do not assert equal wall-clock outcomes for discarded time. Normal 20/30/60/120 Hz and ≤100 ms hitches must agree for the same tick-stamped commands.
- Preserve separate presentation elapsed time for camera/cosmetic spark aging; game time advances only on unfrozen simulation ticks. Hazard warning fill, visibility, activation and expiry derive exclusively from authoritative hazard state/game time, including hit stop; they must never expire on the cosmetic clock. Progress playtime counts admitted foreground elapsed seconds including hit stop, but excludes pause/background and discarded overload time. Pause, modal, hidden tab or lost context clear the accumulator and inputs; resume starts from a fresh timestamp. No hazard/cooldown catch-up after backgrounding.
- On an accepted melee impact request **two frozen simulation opportunities (33.3 ms)**. Multiple contacts from one tick use the maximum request, not a sum. Begin the freeze on the next fixed opportunity after the contact batch. Frozen opportunities count toward the same six-opportunity frame budget. Consume elapsed fixed opportunities while frozen; never accumulate them for later. Freeze all authoritative motion, attacks, cooldowns, regeneration and hazards together. Reduced motion disables shake/flash only, not these rules.
- Capture commands with monotonic sequence IDs and a target tick; process each edge once. Held movement/attack is level state. During hit stop capture input but process gameplay on resume; the 200 ms attack buffer uses game time. During pause/visibility loss discard held and queued actions. Never re-consume an input edge for each catch-up tick.
- Transient state: position/previous position, velocity, recoil velocity, action phase/time, facing, action ID, per-action hit set, dodge protection interval, spawn protection timer, death state, AI pattern and hazards. Keep these out of strict version-1 persisted progress.

Suggested interfaces (names may follow repository conventions, ownership must remain):

```ts
// New app/game/simulation-clock.ts
advanceFrame(elapsed: number, runTick: (dt: number) => void): FrameStep;
// New app/game/kinematic.ts
moveBody(body: Body, displacement: XZ, world: CollisionWorld): MotionPath;
resolveBodyPairs(bodies: readonly Body[], world: CollisionWorld): void;
// New app/game/combat-events.ts
resolveContacts(candidates: readonly ContactCandidate[], state: BattleState): CombatEvent[];
// New app/game/hazards.ts
stepHazards(state: HazardState, dt: number, bodies: readonly Body[]): ContactCandidate[];
```

`MotionPath` retains piecewise, time-stamped sweep/slide segments, not just start/end across a bent path. Contact evaluation and render interpolation sample that resolved path without cutting through a wall. Body-pair depenetration is a constrained projection at the tick endpoint: append an endpoint correction, never shift earlier samples retrospectively, and never generate weapon damage from the correction itself. Ordinary motion/contact intervals are half-open [tickStart,tickEnd); the next tick begins at the corrected position. Render the bounded endpoint correction without interpolating a new path through geometry. `CombatEvent` includes event/action/attacker/target IDs, game tick and sub-tick time, accepted outcome, actual health delta, contact point/normal, reaction and lethal flag. Pure geometry emits candidates; only the resolver changes health. No React state or VFX callback is authoritative.

### Tick order and contact precedence

1. Capture prior roots and snapshots; consume commands; expire timers at exact phase boundaries. Reject actions for dead/paused actors.
2. Choose AI intent and action starts from that snapshot. Charge costs only on accepted starts, lock facing where specified, allocate monotonic action IDs.
3. Advance state machines over the tick, splitting at action/protection/hazard boundaries. Integrate locomotion, authored action travel and prior recoil; sweep against world obstacles. Defer endpoint living-body projections until after contact/death resolution. Store resolved motion paths and time-indexed action/protection snapshots. Locomotion planned for this tick remains committed even if a contact later interrupts an action inside the tick; interruption cancels later attack contacts immediately, while changed velocity/recoil applies next tick. This bounded response delay is an explicit rule.
4. Evaluate contact geometry at each active interval boundary and at spacing ≤1/120 s. Sample both roots and target centers at the same time; sample authoritative unblended poses/sockets. Add additional bounded samples if endpoint travel exceeds half the smallest relevant hurt radius. Clip rays/blades against existing architecture/gate/throne obstruction at that sample.
5. Collect and sort candidates by sub-tick time, then stable action/target ID. Process chronological same-time groups through step 6 one group at a time. Evaluate eligibility, dodge protection and interruption policy from each candidate's timestamped state, never the end-of-tick phase, and honor deaths/cancellations from earlier groups. At equal time, snapshot admitted contacts first: simultaneous trades are allowed. Deduplicate before application; one hit per target/action unless the action is explicitly a hazard pulse.
6. For each admitted same-time group, apply its damage exactly once, latch lethal outcomes, resolve interruptions/rewards under the rules below, queue recoil for following integration, and emit one event per outcome. Cancel future contacts on death before processing the next group. After all groups, update progression/save requests once. Then solve endpoint living-body constraints in stable actor-ID order, excluding newly dead actors, and append their bounded corrections to the paths. No contact resampling or damage is generated by this projection. Snapshot presentation; render interpolation/effects must not mutate the combat state.

Recoil starts on the following unfrozen tick to avoid circular re-simulation of already tested trajectories. This delay of at most one simulation tick (16.7 ms of game time) is deliberate and must be tested; hit stop can extend real elapsed latency. Boundary handling must retain exact partial active intervals rather than rounding all strike durations to ticks.

## 4. Movement, body spacing and reaction physics

### Swept controller

Build 2D blocking boundaries from the **union** of `ROOMS` and `CORRIDORS`, subtracting shared interior edges so joins remain open. Add closed gate slabs and the existing Bone Throne box. Sweep a circle against boundary segments/corners and obstacle boxes, move to first contact minus a small epsilon, then slide along the remaining tangent. Allow at most four slide iterations; discard unresolved displacement safely. Validate the complete circle stays in permitted floor space. Reuse gate/progression authority and throne placement; a missing visual asset must not remove collision.

Do not shrink every room independently and union the results: this can seal valid joins. Do not use endpoint-only acceptance for dashes or recoil. Keep the current `dungeonMove` signature as a compatibility wrapper until callers and tests migrate. Combat ray obstruction can remain the existing BVH query; movement, ray and camera proxies must agree about gates/throne.

Initial movement radii: hero/humanoid 0.45; goblin 0.30; spider 0.55; ogre/golem 0.65; dragon 0.90. Reaper remains 0.45 despite floating artwork. These are proposed movement sizes, **not replacements for current hurt capsules**. Validate clearance and melee reach for every real model and downgrade a proposed size only with a recorded geometry/encounter reason.

- Preserve maximum walk/sprint speeds 5.4/8.6. Approach desired velocity at 48 units/s²; brake at 64 units/s². Analog input controls desired speed; prevent diagonal boosts.
- Preserve reduced movement during wind-up/recovery and active melee. Enforce immediate locomotion-only speed caps of `5.4 × .45` and `5.4 × .25` respectively, including sprint→attack transitions; scaling only desired velocity would incorrectly retain sprint momentum. This also explicitly removes sprint-amplified attack locomotion. Authored travel and recoil are separate from these caps. Authored strike travel is additional displacement integrated exactly once across its active interval and constrained by the same sweep. No wall-lunge teleport or double-applied imported root motion.
- Gait phase follows actual resolved travel, retaining the current anti-wall-walk behavior. Animation grounding stays a visual support correction on flat ground; do not turn weapon tips or capes into floor supports.
- Solve living circle pairs every tick, including stationary wind-up/recovery. Stable IDs choose a deterministic normal for exact overlaps. Use bounded corrections and re-sweep every correction against the world. Boss resistance weight 4, ogre/golem 2, others 1; these are solver weights, not measured masses.
- Use at most four stable pair iterations, each correction ≤0.12 units per body. If a corner cannot resolve all overlaps, keep actors inside world geometry, suppress inward normal velocity and report the unresolved overlap in debug output. Never force an actor through a gate/wall. Keep AI approach spacing so this is an exceptional spawn/crowd case.
- Both player and enemies remain solid during dodge. Dead actors become nonblocking immediately. No collision physics derives from graphics quality or loaded mesh tier.

### Recoil

Replace ordinary-enemy one-off displacement with a bounded horizontal recoil velocity from the accepted hit direction. Initial added speed: 1.2 for ordinary hits, 2.0 for the fourth overhead; total recoil speed capped at 3.0 and decayed exponentially at rate 12/s. Ogre/golem receive half the speed; dragon receives no translational recoil but still gets an authored hit reaction when allowed. Player accepted damage adds 1.2 speed, capped at 3.0. Sweep recoil with all other movement; do not deal extra wall damage in this update.

Keep existing interruption policy initially: ordinary enemy wind-up/recovery can be interrupted, active attacks cannot; player wind-up can be interrupted; boss attacks resist interruption. No perma-stagger by cosmetic effects. Recoil changes position but never fabricates a second hit or cancels a state implicitly.

## 5. Player battle rules

### Retain the current attack sequence first

| Strike | Wind-up / active / recovery (s) | Stamina | Damage multiplier | Target cap | Stagger (s) | Travel |
|---|---|---:|---:|---:|---:|---:|
| Side | .17 / .16 / .25 | 8 | 1.00 | 2 | .16 | .16 |
| Diagonal | .23 / .18 / .27 | 10 | 1.15 | 2 | .22 | .23 |
| Backhand | .15 / .16 / .25 | 8 | .95 | 2 | .14 | .12 |
| Overhead | .34 / .20 / .37 | 15 | 1.55 | 1 | .42 | .30 |

These are verified existing constants. Preserve the 0.20 s latest-input buffer, 0.80 s combo continuation, initial aim selection/facing lock and current regeneration/armor/base-damage rules in the first release. Style adapters remain: blade/claw use articulated contact; bow/staff release one hitscan shot when crossing their active interval. Visual arrows are not new physical projectiles. Q and healing retain current rules; changing their balance is unrelated scope.

### Dodge and protection

- Existing Space/touch dodge remains the only evasive action: cost 25, cooldown 1.1 s, action duration 0.45 s. Lock travel direction to normalized movement intent at start, otherwise facing; remove mid-dodge steering for a committed, readable trajectory.
- Proposed speed envelope: 14 units/s for first 0.30 s, then linearly decelerate to zero over 0.15 s. Unobstructed distance is **5.25 units**. Use exact integral across phase boundaries; solid bodies/world can shorten it.
- Protection applies only to the half-open interval **[0.05, 0.30) s** of that dodge. Startup and recovery are vulnerable. This is a deliberate balance change, not a source measurement. A hazard contact accepted during this window is rejected as `evaded` and cannot replay later from the same one-shot pulse.
- Dodge can cancel attack wind-up/recovery without refund; it cannot cancel active contact. No attack can start during dodge. Starting dodge clears the queued tap and combo continuation through the current cancel path. Ignore new attack tap edges while dodging; do not introduce a dodge attack buffer. An existing held-attack input that remains physically held may start a fresh side strike after dodge ends; release/cancel/visibility loss clears that intent. Resolve same-tick dodge versus attack input as dodge first; allow at most one accepted dodge/strike start. Q and healing retain their existing independent admission rules, with dead/paused actors always rejected.
- Respawn uses separate `spawnProtectionRemaining=1.0`; it grants immunity without invoking dodge motion/pose/cost. Clear old velocity, recoil, queued actions, hit sets, hazards and camera history on reset. Retain current defeated-enemy/save behavior.
- Ordinary damage at dodge startup/recovery behaves exactly like other accepted player damage. Test both sides of every boundary; a late render frame cannot extend protection.

No crouch hurtbox, parry, shield defense or random critical label is added. The raised weapon/ducking reference shapes inspire pose readability; the engine's explicit protection rule supplies the gameplay meaning.

## 6. Enemy and Hollow King patterns

Ordinary enemies keep roster-specific approach distances, 0.55 s preparation and current identities/damage. Apply body spacing, committed facing and contact improvements to them. Prevent idle crowd pressure from moving a preparing enemy through another actor. Avoid starting an attack without an unobstructed feasible target; movement must still permit reaching each objective.

For the existing `king → ember-dragon`, preserve all shrine shielding and activation rules. When unshielded, add a deterministic cycle **sweep → slam → eruption**, skipping only patterns whose documented range or valid footprint check fails. If no pattern qualifies, approach/reposition; never immediately reroll every frame. Enforce ≥0.35 s neutral delay after recovery and an additional 4.0 s game-time cooldown between eruption starts. All boss damage uses the existing base/armor pipeline with the multipliers below.

| Pattern | Proposed timing | Geometry and commitment | Counterplay |
|---|---|---|---|
| Claw sweep | .80 s wind-up, .20 active, .65 recovery; 1.0× base | Existing compatible side/backhand claw pose and real socket path; facing locked at start; .20 forward travel | Leave the swept reach, move behind the committed arc, or time dodge protection. |
| Ground slam | 1.10 s wind-up, one pulse at contact, .85 recovery; 1.25× base | Lock target floor point at wind-up start, within 3.2 units and line of sight; radius 1.40 disk. Existing overhead motion must visibly reach that point. No extra socket damage for this action; categorize its disk as a hazard pulse, so it does not request melee hit stop. | Visible disk throughout wind-up; walk/dodge outside it. A missed target stays missed; no last-frame tracking. |
| Ember eruption | 1.00 s warning, .35 active VFX, .70 boss recovery; 1.0× base | One floor circle radius 1.20 at the player's sampled position, within 8 units/LOS and legal floor. One damage pulse on warning→active, not continuous damage. No ordinary melee hit from the casting pose. | Leave the fixed circle before detonation; dodge protection works at the pulse. Decorative flames have no hit volume. |

The slam disk is an explicit new gameplay shape paired with a visible floor impact, not an enlarged invisible claw. Use the current `overhead` clip only if the decoded dragon's pose reaches the intended ground point. Otherwise add a deterministic authored attack pose adapter using its current rig/contact transforms; never introduce a damaging VFX blade. Keep the same approved path for imported and fallback visuals. Record and test the new pose mapping.

Both boss floor attacks target the living hero only, with no friendly fire. Admit the hero when its authoritative XZ root center is inside or on the drawn disk (`distanceSquared <= radiusSquared`, tangent included with numeric tolerance 1e-6); do not inflate the damage disk by body/hurt radius. Use the same root-center predicate for safe-position tests. Full movement-body clearance still applies to walls and other actors. Both floor attacks are hazard pulses and do not request melee hit stop.

Hazards use `id/owner/actionId/center/radius/warningEndsAt/activeEndsAt/hitTargets`. Limit to one boss hazard at a time. Suppress an invalid eruption and enter neutral reposition; do not silently move its warning after placement. Clip visuals to permitted floor. Walls, closed gates and throne block damage rays to target centers even if disks overlap them.

Before committing a floor attack, simulate conservative walk-only escape candidates from the hero's current position, velocity and action state. Hold existing intent for a 0.20 s reaction allowance, then try 16 evenly spaced heading choices using the real controller for the remaining warning interval. Include current uncancellable active time, reduced attack locomotion, acceleration/braking, and full body/world collision; assume no dodge, sprint, new attack or stamina expenditure. Treat other bodies as stationary blockers for this conservative test. At least one legal candidate must end outside the drawn disk plus a 0.15-unit safety margin before its pulse. Do not count passage through a body/closed gate/throne as escape. If none qualifies, choose a different pattern; do not add pathfinding scope merely to force a hazard placement.

A hazard's warning never damages; each eligible target can be damaged only once at its pulse. Dodge or spawn protection can reject it. A second overlapping hazard is forbidden by the one-hazard limit. Pause freezes its lifecycle. Boss death/reset/disposal cancels both volume and visuals. No future pulse remains after the owner dies.

## 7. Feedback, animation, death and camera

- Keep `roster-assets.ts` absolute pose sampling, manifest contact phases, actual handedness/embedded sockets, grounding curves and `RosterPresentation` restoration. Render blending cannot alter the pure pose used for contacts. Do not sample earlier pose times at the final root or advance presentation during collision subsamples.
- Emit damage numbers only for accepted positive damage / health loss, using actual clamped HP delta after armor/shield checks. Example: 20 remaining HP and a 50-point hit shows 20. Rejected shielded/evaded hits may emit distinct quiet feedback, never ordinary damage sparks/numbers. No `Critical` text without a separately designed rule.
- Derive sparks from the resolved contact point, recoil from its direction, and two-tick hit stop from the accepted melee event. Preserve the existing 96-particle pool; cap floating numbers at eight globally and one newest label per target, lifetime ≤0.65 s. Dropping a cosmetic effect never drops its damage event.
- Warning circles retain a high-contrast outline plus filling/shape change, visible with particles disabled, under reduced motion and all quality tiers. Avoid giant flashes over enemy preparations; show damage feedback away from the weapon silhouette. Keep existing usable controls/minimap, not the video's layout.
- On lethal damage set dead immediately, cancel attacks/AI and pending owner hazards, remove body/hurt admission, issue reward/progression once, then play the grounded death clip. Remove the current downward root sink. Hold the final grounded pose for 3 s, fade over .75 s, then hide/release as current streaming permits. During a terminal death/victory overlay, a finite presentation-only death clock advances the hero and terminal enemy clips/hold/fade while all gameplay remains frozen. Keep rendering only until this animation finishes; the current paused single-render path must support that exception. Visibility/context loss still suspends it without catch-up, and an ordinary user pause freezes it. This clock cannot advance hazards, resources, rewards or save time. Restart/re-entry must not resurrect defeated enemies or pay rewards again.
- Victory is emitted only from Ashen's existing king/win transition; normal enemy deaths do not show it. Latch lethal outcomes before applying reward healing: XP/embers/defeat credit is awarded once, but a level-up must not heal an already lethally hit hero. Living heroes retain level-up healing. For a simultaneous ordinary-enemy/hero death show only the death overlay. For a simultaneous king/hero death set `won=true`, retain hero HP=0, and show only the victory overlay with a mutual-defeat message and Return to shrine action; that action uses respawn to restore health while preserving victory/defeats. Emit one terminal UI event and one milestone/save request after the batch. Reloading `won=true, health=0` must offer the same safe return route without paying rewards again.
- During an active boss encounter, ease the camera focus toward a weighted midpoint between hero and boss, with vertical framing accommodating the dragon. Bound horizontal focus displacement to 1.5 units from the hero and extra distance to 1.2 beyond the current 7.8 portrait / 7.2 other view. Respect user yaw/pitch; no forced orbit/lock-on mode. Outside the encounter restore ordinary follow smoothly.
- Add a small camera clearance volume (initial radius .20) or equivalent near-plane corner probes to the obstruction query, including gates/throne. Check final interpolated camera clearance as well as desired position. If framing competes with a wall, collision safety wins; never move actors to satisfy framing. Reduced motion disables impact shake and aggressive focus transitions without altering combat.

## 8. Dependency-ordered work packages

Implement on a `codex/` branch in the chosen current checkout. Preserve unrelated work, including existing untracked `docs/visual-upgrade/* 2.json` files. Each package should leave a playable game and a reviewable commit. Do not expand into a full engine rewrite.

| Package | Exact primary files / new modules | Deliverable and exit condition |
|---|---|---|
| P0 — baseline and behavior contract | `docs/mechanics-video-review/`, `tests/engine-feedback.test.mjs`, `tests/visual-assets.test.mjs`, `docs/VISUAL_ASSETS_4K_UPDATE.json` | Record HEAD, current checks and a short combat capture. List intended changes before updating frozen fixtures. Preserve save/API protections and asset hashes unrelated to gameplay. |
| P1 — simulation clock | New `app/game/simulation-clock.ts`; `engine.ts`; `mobile-runtime.ts`; new `tests/simulation-clock.test.mjs` | Fixed-step accumulator, bounded overload, interpolation, hit stop, command ownership, lifecycle reset. Normal frame partitions replay identically. Keep old attack balance. |
| P2 — collision and body motion | New `app/game/kinematic.ts`; `dungeon.ts`; engine movement/AI; new `tests/kinematic.test.mjs`; existing game/throne tests | Sweeps, valid joins/gates, radii, acceleration, stable crowd resolution and recorded motion paths. All shrines/doors remain reachable. No tunnelling. |
| P3 — contact and outcome authority | `combat.ts`; new `combat-events.ts`; engine contact/damage/rewards; `combat-animation.ts`; roster adapters; combat/roster/feedback tests | Relative attacker/target sampling; stable time ordering, simultaneous trades, accepted-hit events, bounded recoil and one-time rewards. Existing wall/range/style protections pass. |
| P4 — dodge and grounded death | Engine actions/respawn/dead branch; `Game.tsx`; `mobile-runtime.ts`; `roster-assets.ts`; `character-assets.ts` fallback; new `tests/action-rules.test.mjs` | Exact dodge envelope/protection/cancels; separate spawn protection; grounded death and finite lifecycle. Controls remain keyboard/touch compatible. |
| P5 — boss patterns and hazards | New `app/game/enemy-patterns.ts`, `app/game/hazards.ts`; engine AI; `effects.ts`; roster attack adapter if required; new `tests/hazards.test.mjs`, `tests/enemy-patterns.test.mjs` | Three distinct dragon patterns, fair fixed warnings, authoritative pulses, owner cleanup. Preserve shrine shield and IDs. |
| P6 — readability and UI | `camera-feedback.ts`; engine camera/events; `TouchControls.tsx`; `Game.tsx`; relevant HUD/effect component found during implementation | Truthful bounded feedback, warning visibility, encounter framing and camera clearance. Shared action configuration supplies any UI availability/cost hints. |
| P7 — integration acceptance | Existing/new tests, browser/device captures, `docs/MECHANICS_UPDATE_RELEASE.md` | Full validation with exact revision, deliberate baseline deltas, known limits and rollback. Publish only if the implementation task separately requests deployment. |

P2 can be developed independently against pure fixtures while P1 is completed. P5's pure state/geometry tests and P6's visual designs can be prepared in parallel; integrate them only after P3 supplies the final event contract. One owner should edit `engine.ts` at a time. Agents can independently audit source fidelity, geometry/tests and UI without conflicting file edits.

## 9. Acceptance matrix

The following checks must prove behavior, not merely mirror constants. Tests need failure cases demonstrating why the implementation is necessary.

| ID | Scenario and required result | Evidence / owner |
|---|---|---|
| A1 | Replay the same tick-stamped commands at 20/30/60/120 Hz and jitter with ≤100 ms stalls. Final health, resources, actions/hits/progression equal; roots within 1e-5 units. A 250 ms stall records discarded time and executes ≤6 ticks without backlog. | Pure clock plus full-engine trace; P1 |
| A2 | Pause/hidden/context loss in wind-up, active, dodge, hazard warning and hit stop. Resume causes no teleport, replayed input, instant hazard pulse or cooldown fast-forward. Normal attack release preserves its buffer outside dodge; cancel/lost capture clears it. Verify that warning fill/visibility freezes with hit stop and resumes with its authoritative pulse. | Existing lifecycle/touch tests extended; P1/P4/P5 |
| A3 | At max speed, dodge, lunge and capped recoil, try thin obstacles, closed gates, room gaps, diagonal corners and Bone Throne from both sides. No trajectory enters blocked space; tangential motion slides; room/corridor joins stay traversable. | Kinematic/game/throne tests; P2 |
| A4 | Start two bodies coincident, push a crowd at a gate, stand in attack range, and dodge into a boss. All positions finite, deterministic, inside world; stationary actors separate or report bounded unresolved overlap. Defeated bodies stop blocking. Crowd endpoint corrections must not create retroactive hits or visual paths through walls; sprint→attack must immediately obey its locomotion cap. | Body solver tests plus gameplay; P2 |
| A5 | Fast attacker and target cross in opposite directions during active time; add wall slide and recoil. Contacts follow time-aligned resolved paths, cannot cut a corner, cannot hit through obstacles, and occur once per target/action. | Contact integration tests; P3 |
| A6 | Same-time mutual lethal contacts trade deterministically; later contacts from cancelled/dead sources fail. Test a lethal wind-up contact that becomes active later in the same tick, and dodge protection that expires later in the tick: admission uses contact-time state. Test ordinary-enemy level-up trades and king trades: no reward-healing resurrection and exactly one correct terminal UI/save event. Cleave cap, armor/shield rejection, base-to-muzzle blockage and nearest ranged target remain correct. | Resolver plus existing game tests; P3 |
| A7 | Dodge unobstructed travel =5.25 units regardless of frame partition; blocked travel shorter. Hurt at .049/.050/.299/.300 s verifies [0.05,.30). Verify stamina/cooldown once, fixed direction, active-attack rejection and spawn immunity without speed boost. Queued taps clear on dodge; taps during dodge do not replay; continued held attack starts only after recovery and resets to side strike. | Action tests; P4 |
| A8 | Inspect all six heroes/ten enemies with mobile, HD and fallbacks. Actual sockets reach targets at real AI approach distance; pose blending/extra samples/loading mid-swing never alters contacts. No double weapon, foot drift into floor, duplicate root motion or graphics-tier damage changes. | Existing roster/presentation tests + capture; P3/P4 |
| A9 | Boss cannot use new patterns while shielded. Sweep/slam/eruption have different preparations, committed aim and a visible counterplay route at center and near wall/throne. Validate actual dragon pose for slam. | Pattern tests + normal/slow visual review; P5 |
| A10 | Hazard warning does no damage; pulse hits once, outside target centers safe, tangent root included, protection honored, blocked rays safe. Test positions just inside/on/outside the warning rim and verify no hurt-radius expansion. Invalid/no-escape placement is rejected, including a hero committed to overhead active/recovery near wall/body constraints. One hazard max; owner death/reset/disposal cancels future damage. Same entry/exit trace across rates produces equal outcomes. | Hazard integration tests; P5 |
| A11 | HP deltas equal displayed numbers; rejected contact emits no ordinary hit effect. Particle/label caps hold during prolonged fight. Reduced motion and performance mode retain visible warning geometry and identical authority. | Event/feedback tests + visual capture; P6 |
| A12 | Lethal hit cancels actions, awards/saves once, leaves grounded corpse then removes it on schedule. Re-entry and reload preserve defeats. Only the final-win condition triggers victory. Hero and boss death clips finish under terminal overlays while gameplay stays frozen; hidden tabs suspend their presentation. A won/zero-HP save reloads without a soft lock. | Death/progression tests + capture; P4 |
| A13 | Portrait/landscape camera at doors, corners, pitch limits, boss feet/claws, throne and respawn has near-plane clearance. Main threat remains readable where geometry permits; touch fingers do not hide the warning/escape path. | Browser plus physical touch-device review; P6 |
| A14 | Load existing version-1 saves, switch hero/quality, clear/reset run and save concurrently. No new schema fields, ownership/revision bypass or lost progress. Restoration/build pruning preserves current assets. | Existing model/API/save/asset tests; P7 |
| A15 | Sustained boss + hazard + feedback on physical iPhone Safari: record model/iOS, quality, frame-time p50/p95, memory trend, dropped sim time and touch behavior for 5 minutes. Target stable 30 FPS performance mode; investigate sustained drops or growth. | Device measurement; P7. Do not claim completion from desktop emulation. |

Recommended manual captures: (a) Lion Knight vs Ogre in a corridor, showing spacing, miss/hit/recoil and grounded death; (b) Hollow King sweep/slam/eruption, showing each avoidance route; (c) Ranger/Sage against moving enemies near a gate, preserving ranged behavior. Record normal speed plus slow inspection. These captures validate Ashen; do not splice source imagery into them.

## 10. Validation, intentional deltas, persistence and rollback

Run from the selected repo with its supported Node/runtime and restored asset prerequisites. At baseline and final integration use:

```sh
npm run typecheck
npm run lint
npm test
npm run check:syntax
```

`npm test` already runs the verified production build before the suite; avoid an extra redundant full build. Syntax checking includes compiled output, so run it after that fresh build. During packages run focused tests first, then the full suite for integration. Record any pre-existing lint/test failures separately with evidence; do not silently waive them or count historical 210 passing tests as validation of this mechanics update.

Expected behavior changes requiring reviewed fixture updates: frame handling under load, acceleration/body blocking, recoil, moving contact admission, dodge steering/distance/protection, spawn movement, boss patterns/hazards, grounded corpse lifecycle, simultaneous-lethal reward/UI precedence, and event-driven numbers. Player strike constants, base damage/armor, Q/heal rules, roster/asset provenance, save/progression protections and ranged delivery are retained. Put before/after traces in the release note; never refresh exact combat snapshots until each difference is explained.

The old `visual-assets.test.mjs` gameplay SHA freeze enforced an earlier visual-only scope. Replace only the now-authorized gameplay freezes with these behavior contracts; retain unrelated asset/data/security protections. Do not blindly refresh every protected hash. Keep tests that catch regressions rather than deleting tests that fail because of an intentional new rule.

No schema migration is needed: all additions are transient and old version-1 saves remain valid. On load, initialize new transient state safely, validate saved XZ against current world constraints, and preserve progression. If later work adds persistent resources or identities, that is a separate scope requiring migration in load, PUT and upgrade paths, golden old-save fixtures, and unchanged ownership/CAS/run-ID rules.

Use small dependency-ordered commits. Roll back a failing package together with its dependent packages; never run a new contact resolver with old motion-path semantics. Keep a release branch/tag and baseline capture for comparison. Do not leave two competing damage authorities behind an untested runtime flag. No raw reference media belongs in the deployment package.

This document is the requested handoff; **no mechanics code was changed, no new implementation tests were run, and no deployment was performed for this planning task**. If a future implementation includes publishing to the existing `chatgpt.site` site, follow the installed Sites hosting workflow and verify the exact deployed revision after acceptance.

### Instruction for the next AI instance

> Implement this plan in dependency order, beginning with repository status and P0 baseline. Read the eight review reports and two code audits, preserving the distinction between observed visuals and chosen game rules. Recheck symbols/HEAD, centralize simulation/event ownership, and keep the recovered assets and version-1 journeys intact. Use parallel agents for isolated geometry/tests, source-fidelity review and visual QA; serialize shared engine edits. Finish meaningful automated and visual acceptance, document intentional balance deltas and unresolved device evidence, and do not describe untested mechanics as complete. This handoff itself does not request publication.

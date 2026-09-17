# Physics and battle mechanics update — release evidence

Implementation receipt for `codex/physics-battle-update`, based on `459759d98c7c51fab23177f0ee199fef7a16dca5`.
Final implementation revision: `c0c0a9cf5909a043b288bd7ab123063ce2bf6c84`. Final verification timestamp: 2026-09-17T10:35:37.959213+00:00.
Implementation follows [PHYSICS_BATTLE_VIDEO_UPDATE_PLAN.md](PHYSICS_BATTLE_VIDEO_UPDATE_PLAN.md); its video observations are inspiration, not measurements of a reference game's engine.
P1–P6 code is integrated. The final tier audit also fixed a pre-existing 0.002043-unit spider socket discrepancy: both variants now use the same measured HD rest bounds, including the source authoring entry and both runtime manifest URLs. Geometry, skeletons, source hashes and animation tracks are unchanged. P7 has automated and selected browser evidence, with the manual/device limits below. No deployment was requested or performed. Full acceptance remains open for the explicitly incomplete manual/device criteria; the implementation is not a physical-device certification.

## Changes and preserved contracts

The engine now owns a fixed simulation clock, resolved motion paths and chronologically resolved combat events. Rendering and feedback consume that state. Pure helpers cover timing/actions, swept collision, locomotion, contact outcomes, boss patterns and hazards; grounded death, camera clearance and bounded feedback are integrated with the existing actors.

| Contract | Before | Implemented behavior |
|---|---|---|
| Simulation and input | One variable update per render; public action edges mutate immediately | 1/60 s ticks, ≤100 ms admission and six opportunities per frame; one tick-stamped command drain; discarded overload is reported |
| Hit stop and playtime | Approx. 35 ms stop, including shielded contact | Accepted melee damage requests two frozen opportunities, maximum rather than sum; admitted foreground playtime includes freeze, excludes pause/background/discarded time |
| Movement | Immediate velocity, endpoint/axis collision, soft approach separation | Acceleration/braking, swept circles, recorded slide paths, immediate attack speed caps, deterministic living-body separation and bounded swept recoil |
| Contact | Articulated samples used final roots | Attacker and target sampled on their resolved paths at contact time; endpoint body corrections cannot create earlier hits |
| Dodge | Steerable and protected throughout; spawn reused dodge motion | Direction locked; 14 units/s for .30 s then .15 s deceleration, 5.25 unobstructed travel; protection [.05,.30); separate one-second spawn protection without a dodge-speed boost |
| Dodge admission | Existing tap/combo behavior lacked these explicit priorities | Cost 25/cooldown 1.1 s retained; wind-up/recovery can cancel, active cannot; queued/new dodge-time taps discarded; prior held attack may restart at side after dodge |
| Boss | Repeated ordinary strike sequence | Unshielded sweep/slam/eruption cycle, committed aim, walk-escape placement checks, one authoritative floor pulse and one hazard maximum |
| Slam reach | Generic overhead mapping was insufficient | Imported Dragon and procedural fallback use a measured grounded pose; slam locks a reachable point about 1.5 units ahead, with a visible 1.4-radius shockwave. Unreachable/uneven placements fail safely |
| Damage and terminal state | Direct mutations could depend on iteration/reward order | Same-time trades resolve together; later cancelled/dead attacks fail; lethal state latches before rewards; ordinary trade shows death, king trade wins at zero HP with safe shrine return |
| Death and feedback | Sinking corpse and contact-driven effects | Grounded death, three-second hold, .75 s fade, finite retirement; terminal overlays advance death presentation only; positive actual HP loss drives bounded numbers |

Player strike timings/costs/multipliers, .20 s buffer/.80 s combo continuation, base damage/armor, Q/healing, hitscan bow/staff, six heroes/ten enemy identities, shrine/gate progression and recovered asset provenance remain the foundation. No new save schema, ballistic projectile, ragdoll, jump, parry or critical-hit rule was introduced.

Historical [combat-baseline.json](../tests/fixtures/combat-baseline.json) remains unchanged. [mechanics-baseline-delta.json](../tests/fixtures/mechanics-baseline-delta.json) records reviewed differences rather than regenerating the old capture: closed-gate endpoint `z=6 → 5.600001`; wall-slide endpoint `(15,19) → (15.549999293,19.000000707)`; queued admission, accepted-only hit stop and narrower dodge protection. Broader changes are covered by behavioral tests.
The previous visual-only SHA restriction is relaxed only for the explicitly mechanics-owned files in `visual-assets.test.mjs`; unrelated protected hashes remain checked.

## Verification receipt

| Check | Recorded status |
|---|---|
| Final `npm run typecheck` | Passed |
| Final `npm test` (includes verified production build) | 370 passed, 0 failed; verified production build passed at the implementation revision above |
| Final `npm run check:syntax` after that build | Passed: 125 source files and 22 compiled JavaScript modules |
| Final lint | Passed: 0 errors and 29 pre-existing warnings. Baseline: 208 errors/29 warnings. A scoped rule allows require() only in retained assets-source/**/*.cjs authoring tools; runtime checking remains enabled |
| Deterministic engine replay | [engine-replay.json](mechanics-implementation/engine-replay.json): 20/30/60/120 Hz and jitter including 100 ms, five admitted seconds, 290 ticks + ten frozen opportunities, equal authoritative trace |
| Engine terminal timing | Five focused cases passed: normal pause, terminal-only ages, finite real-loop retirement, overlay restoration and suspended-loop restoration without catch-up |
| Mobile/HD and hazard follow-up | All 16 models have equivalent sampled skeleton transforms and combat sockets after canonical spider normalization; a real engine entry/exit hazard replay matches five frame schedules |
| Boss poses | Actual mobile GLB and procedural fallback tests cover physical floor reach, original sockets/bone lengths, finite poses, restoration, clone/tier isolation and frame-start transition order |

Replay trace SHA256: `00e68a06552c2dc82cef7972ec3a32033a2c27fdf91e2423c20bbe8e28543941`. This is an automated engine fixture, not a performance measurement or exhaustive encounter replay.

## Acceptance matrix

“Automated” identifies exercised contracts, not completion of every manual clause in the plan. The receipt above records the final aggregate checks for this implementation revision.

| ID | Evidence and present coverage | Remaining boundary |
|---|---|---|
| A1 | `simulation-clock`, `engine-mechanics` and replay receipt cover rate partitions, 250 ms overload, bounded opportunities and equal outcomes | Browser/device timing is not inferred from Node replay |
| A2 | Clock/action/touch/mobile-runtime, `engine-hazards`, `engine-terminal-timing` and terminal-loop tests cover queue clearing, pause/hit-stop warning freeze and restoration; browser paused-warning capture agrees | Full browser lifecycle matrix across every action/context-loss point remains unperformed; suspended-loop tests mirror lifecycle reset operations, not DOM dispatch |
| A3 | `kinematic`, `engine-boundaries`, `game`, `throne` and locomotion tests exercise swept blockers/joins/sliding; browser gate dodge stops at 5.600 | No claim of exhaustive manual traversal from every obstacle side |
| A4 | Body-pair/locomotion/engine tests cover deterministic overlap, bounded unresolved reporting, dead nonblocking bodies, phase-boundary caps and nonretroactive correction | Full crowd-at-every-gate browser review remains pending |
| A5 | Engine moving-root/contact tests exercise relative samples, obstruction, recoil and endpoint-correction exclusion | All animated roster crossing combinations not manually reviewed |
| A6 | Resolver and engine tests cover simultaneous lethal trades, later cancellation, contact-time protection/phase, level-up resurrection prevention and correct terminal/reward event counts; retained combat/roster tests cover caps and style safeguards | Automated coverage is the primary evidence for adversarial same-tick trades |
| A7 | Action/locomotion/engine tests cover 5.25 travel, boundary immunity, fixed direction, costs/cooldown, cancel/held rules and spawn separation; gate and boss-avoidance browser captures supplement | Physical touch timing remains untested |
| A8 | Existing roster/asset/presentation safeguards, all-16 mobile/HD sampled socket/skeleton equivalence and new actual-GLB/fallback boss-pose tests; current low-tier Lion/Ogre, Ranger, Sage and Dragon browser evidence | **New all-roster HD and fallback visual re-review is incomplete**; prior roster approval is not a new complete pass |
| A9 | Pattern/hazard/pose tests cover shield admission, committed targets and measured slam reach for imported/fallback rigs; browser boss encounter shows real damage and fixed warnings | Full normal/slow center/wall/throne counterplay review for all three patterns remains pending |
| A10 | Pure hazards plus `engine-hazards` cover root-center rim, one pulse, contact-time path/protection, walls, escape constraints, owner cancellation, hit stop and same-time outcomes; actual moving hero entry/exit pulse traces agree at 20/30/60/120 Hz and 100 ms jitter; browser dodge leaves warning safely | Complete browser rim/escape matrix across all committed actions and body constraints remains pending |
| A11 | Event/feedback tests cover actual clamped HP loss, rejection, bounded pools and reduced-motion authority; browser contact logs show clamped lethal loss | Prolonged visual pool/readability stress and physical reduced-motion review remain pending |
| A12 | Combat/terminal/death-retirement tests cover immediate authority, one-time rewards, finite presentation, roster disposal, upright respawn and won/zero-HP safety; browser boss encounter records hero death with one milestone | Browser full reload/re-entry permutations and hidden terminal DOM sequence not exhaustively rerun |
| A13 | Camera volume/framing tests and desktop/390 px portrait mechanics-lab boss and shrine-return views provide partial evidence | **Full portrait/landscape doors/corners/pitch/throne/respawn and physical touch occlusion review pending**; recorded portrait layout capture is not a phone test |
| A14 | Existing model/save/API/asset tests retained; fixture tests validate all hero/start combinations; transient mechanics do not alter version-1 progress or ownership/CAS/run-ID rules | Final suite passed; no new manual multi-session concurrent-save claim |
| A15 | A connected physical iPhone 17 Pro Max / iOS 27.0 was identified; Mirroring reports “iPhone in Use.” No gameplay measurement collected | **Unperformed:** five-minute physical iPhone Safari boss/hazard run with model/iOS, p50/p95, memory trend, dropped simulation time and touch behavior |

## Browser evidence and its limits

The DEV-only `/mechanics-lab` uses the ordinary engine without benchmark invulnerability and isolated local fixtures; it does not invoke the save API. Fixture selection is disclosed in the UI. Layout simulation is not device emulation, and impact-shake selection does not alter the detected OS reduced-motion preference.
Portable captures and DOM diagnostics are included in [mechanics-implementation/browser/](mechanics-implementation/browser/). The original workspace captures remain in references/mechanics-implementation/qa outside the checkout. Some early captures precede action-ID allocation and pose-transition fixes; final Ranger/Sage, portrait and shrine-return captures use the final runtime.

| Artifact | What it supports |
|---|---|
| `ogre-duel-browser.json` | Normal Lion/Ogre combat; 40/26/14 actual melee loss, one Warden notice and milestone; no unresolved/invalid bodies in the captured endpoint |
| `gate-dodge-browser.json` | Closed gate stops hero at `z=5.600`; no invalid bodies in the captured endpoint |
| `boss-warning-paused.json`, `boss-dodge-avoidance.json` | Fixed eruption warning remains unchanged while paused; subsequent dodge movement leaves the disk with HP 140 and no recorded damage. This demonstrates spatial avoidance, not a timed immunity-boundary test |
| `boss-death-browser.json` | Hero takes hazard/melee damage, final loss clamps to five HP, one death plus one milestone, no remaining hazard. Filename refers to the boss encounter; **the boss was not killed** |
| `ranger-ogre.json`, `sage-ogre.json` | Real ranged releases deal 26/30/24 loss and one milestone with ordinary engine resources |
| `boss-portrait-active.json`, `boss-slam-warning.json`, `shrine-return-portrait.json` | 390 px portrait layout shows eruption and committed slam warning. Terminal retirement followed by shrine return restores the loaded Lion Knight upright at HP 140, stamina/mana 100. A13/A15 physical-device limits remain |

The mobile boss pose sample found bounded source-mesh floor penetration (lowest claw/chain about −6.8 cm); fallback boots about −4.5 cm. Both physical slam contact points reach the committed floor target at about +3.5 cm. These are measured tolerances, not a claim of zero mesh intersection or new approval of every HD pose.

## Persistence and rollback

Version-1 saves require no migration: velocity, queues, hazards, action/death clocks and presentation are transient. Keep ownership, revision/CAS, run-ID and defeated/won progress handling unchanged; a dead winning hero must retain a safe shrine-return path after reload. Keep source models, provenance, reference-review reports and the original baseline capture.

1. Record the tested final revision and preserve this branch before rollback. Revert in Git; do not reset shared saves, asset originals or unrelated work.
2. Treat P1–P4 timing, command admission, motion paths, contact authority, dodge/death lifecycle and their engine/UI/roster integrations as one dependent group. Never pair the new resolver with old final-root sampling, or restore variable updates while retaining tick-stamped admission.
3. P5 rollback must remove/revert its engine pattern selection, hazard authority/presentation and boss-pose hooks together. Keep shrine shielding and normal boss identity intact. Do not leave a damaging disk without its warning/physical pose.
4. P6 presentation rollback must update all engine/React callers together with helper removal. Keep the single event/HP authority; do not restore a competing damage route to retain effects.
5. For complete rollback, revert the complete mechanics change set to the recorded baseline behavior with its matching tests; rerun typecheck, verified build/tests and syntax checks. Review deliberate fixture deltas rather than blindly rewriting snapshots or protected hashes.

Publication is a separate action. This receipt neither deploys the branch nor certifies the outstanding physical-device/manual criteria.

A body-push experiment moved the boss beyond the committed slam point's physical reach. The pulse was cancelled with no damage, rather than shifting the warning or stretching the model. [Actual model displacement samples](mechanics-implementation/boss-pose/displacement-results.json) independently reproduce that safety gate.

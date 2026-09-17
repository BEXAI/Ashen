# Video 1 — pass 4: adversarial review and Ashen mapping

Completed 17 September 2026 by the primary agent. This was a second independent root-agent visual traversal after pass 1; the physics and battle passes were performed by separate agents. All ten sheets `all-frames-00.jpg` through `09.jpg` were inspected again in chronological order. Each contains 24 consecutive decoded frames: all 240 frames, t=0.000–9.958333, displayed duration 10.000 s. This is a complete frame-by-frame visual review, not continuous audiovisual playback. Audio was not reviewed.

## Coverage ledger

| Sheet | One-based frames | Time represented | Mapping / counterexample checked |
|---|---|---|---|
| 00 | 1–24 | 0–1 s | Approach, guard-like stance and enemy raised preparation; duplicated HUD is visible. |
| 01 | 25–48 | 1–2 s | Low torso contact and sparks; both actors move through articulated poses, not demonstrated rigid-body response. |
| 02 | 49–72 | 2–3 s | Second preparation, close blade path and contact; no observable causal touch input. |
| 03 | 73–96 | 3–4 s | Repeated impact feedback, health string changes; screen labels cannot supply a reliable damage ledger. |
| 04 | 97–120 | 4–5 s | Health returns to 755/1000 despite prior contact; broad trail extends beyond physical blade. |
| 05 | 121–144 | 5–6 s | Wind-up/follow-through and −198 label; no measured recoil distance or force. |
| 06 | 145–168 | 6–7 s | Enemy torso reaction; inconsistent percentage-like health labels. |
| 07 | 169–192 | 7–8 s | Final attack preparation/contact; HUD disappears around 7.750 s and Victory appears near 7.875 s before fall finishes. |
| 08 | 193–216 | 8–9 s | −412 CRITICAL, opponent collapse/dust, hero follow-through; no defensible critical probability. |
| 09 | 217–240 | 9–10 s | Persistent grounded fallen body and hero recovery; no corpse disappearance or loot interaction shown. |

## Decisions for Ashen

| Evidence interval | Decision | Concrete mapping | Limit / rejected inference |
|---|---|---|---|
| 0.750–1.458, 2.333–3.458 | Adopt readable preparation → contact → recovery | Retain `combat.ts` states; make phase time authoritative for pose, contact eligibility and root travel. | Exact gameplay windows cannot be read from an illustrative render. Proposed Ashen timings must be labelled tuning. |
| 1.250–1.458, 5.708–6.500 | Adopt localized impact and recoil | Resolve one accepted hit, then derive health delta, contact spark, short hit stop and bounded recoil from that event. | Sparks alone are not proof of hit admission or force. Never turn blade-trail volume into damage geometry. |
| 2–7 | Adapt body spacing and weight | Add collision-constrained root motion and crowd-body separation; preserve articulated socket contacts. | No reliable evidence of solver, body mass, foot IK, or wall collision. These are code-derived engineering choices. |
| 7.750–10.000 | Adapt grounded death with authoritative outcome | On lethal damage cancel combat immediately, settle the visual death pose on the floor, award once, show victory only from the existing win condition. | Do not copy a video-time-triggered Victory banner or infer every single enemy kill ends the dungeon. |
| Throughout | Preserve Ashen controls and roster | Keep six heroes, ten enemy IDs, existing input ownership and mobile layout. | Two Attack buttons/two minimaps, fixed HP display, and changing enemy labels are unsuitable interaction specifications. |

## Adversarial conclusions

- Fixed simulation steps, swept movement, separation and moving-root contacts are supported by current code risks, not demonstrated source algorithms. They are enabling engineering work for consistent combat feel.
- The hero's raised sword and constant HP do not establish blocking, parrying or invulnerability. No new block/parry action is required by this reference.
- No jump, slope, fall, ballistic projectile, ragdoll, poise meter or randomized critical system is demonstrated. Keep them outside this implementation scope.
- Preserve single-target hit deduplication, wall/gate obstruction, progression and asset provenance. Current source-based contact sampling already exists; improve its relative-motion correctness instead of replacing it with range-only damage.

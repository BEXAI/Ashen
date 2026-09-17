# Video 2 — pass 4: adversarial review and Ashen mapping

Completed 17 September 2026 by the primary agent. All 31 sheets `all-frames-00.jpg` through `30.jpg` were visually inspected in chronological order; sheets 00–29 contain 24 consecutive frames each and sheet 30 contains the last two. Coverage: zero-based F0000–F0721, all 722 frames, PTS 0.000–30.041667, full duration 30.083333 s. PNG filenames are one-based. No frame subsampling was used. This is a full frame-by-frame visual review, not continuous audiovisual playback; audio was not reviewed.

## Coverage ledger

| Sheets | Zero-based frames | Time span | Counterexamples and design mapping checked |
|---|---|---|---|
| 00–03 | 0–95 | 0–4 s | Initial labels precede any observable hit; approach, overhead/forward sword action, chest spark and lateral reset. |
| 04–07 | 96–191 | 4–8 s | Ground patch becomes a fire column; sword lifts and chest contacts; no reliable player-health consequence. |
| 08–11 | 192–287 | 8–12 s | Repeated overhead sword motions, claws sweeping nearby, local flashes; some labels change without a unique new contact. |
| 12–15 | 288–383 | 12–16 s | Further blade preparations/chest flashes, large critical text; extensive visual effects can obscure threats. |
| 16–19 | 384–479 | 16–20 s | High held blade → low crouching posture beneath broad claw sweep; both actors lower while floor flames expand. |
| 20–23 | 480–575 | 20–24 s | Hero rises/resets, another sword action/chest flash; repeated −203 and 1024 labels accumulate. |
| 24–27 | 576–671 | 24–28 s | Additional overhead motion/impact, duplicate critical text, boss raises arm/flame blade-like form and slams toward floor. |
| 28–30 | 672–721 | 28–30.083 s | Player withdraws and crouches again; boss raises a visibly blade-like fiery form and strikes down, ending mid-encounter. |

## Evidence and decisions

| ID | Time | Visible evidence | Adopt / adapt / reject |
|---|---|---|---|
| V2-M01 | 0–3.958 | Close sword action, chest flash and torso reaction; hero repositions afterward. | Adapt a readable action cycle, collision-limited lunge/recoil and a recovery opening. Do not infer numeric force or damage. |
| V2-M02 | 3.958–6.208 | A bright foreground floor patch precedes a growing vertical flame column. | Adapt as an explicit warning → eruption → expire hazard. The footage does not prove the patch was an intentional warning or its exact damage interval; specify those rules for Ashen. |
| V2-M03 | 6.250–16.958 | Repeated overhead sword preparations/contact flashes, some extremely bright. | Preserve threat silhouettes and phase visibility, pool effects, and drive labels from accepted hits. Reject stacked persistent numbers and flashes that obscure attacks. |
| V2-M04 | 17.208–19.958 | Hero lowers torso while boss sweeps a claw across and bends down; flames expand around them. | Adapt a clearly posed evasive action with an explicit limited protection window. Neither button causality nor success/i-frames/capsule shrink can be established. Use existing dodge input; do not invent a separate crouch system. |
| V2-M05 | 20–25.958 | Hero returns to a ready position and resumes several sword motions; duplicate critical labels persist. | Build outcome-consistent feedback and short lifetimes. No critical multiplier, probability or damage formula is recoverable. |
| V2-M06 | 26–30.083 | Boss raises a flame blade-like form, brings it toward the floor, raises it again, and attacks as hero retreats/crouches. | Adapt a distinct committed overhead boss slam with a visible footprint and recovery. Map to the existing dragon's claw/body slam; a new humanoid boss or weapon asset is unnecessary. |
| V2-M07 | 0–30.083 | Portrait view keeps much of both actors visible, but bright effects/UI compete with attacks; no defeat occurs. | Add bounded encounter-aware camera framing and restrained feedback. Reject a copied HUD and any claim that this clip demonstrates victory/rewards. |

## Ashen integration constraints

- Implement the overhead/slam/hazard ideas on the existing Hollow King dragon identity, behind the current shrine shield/progression conditions. Do not silently replace it with the legacy humanoid Sovereign.
- Flat XZ movement remains sufficient. No gravity/jumping, terrain redesign, dynamic ragdoll or full rigid-body engine is justified here.
- The source filename contains `generated_video`; anatomy, flame weapons and text change/morph. Treat this as illustrative visual direction, not measured gameplay or engine telemetry.
- Keep physics authority separate from presentation. Protective dodge state, body contact, hazard shape, damage and status need explicit rules and deterministic tests; visuals alone cannot define them.
- Fire on the floor can be either decoration or a hazard in the footage. In Ashen, an active hazard must have an explicit readable outline and lifecycle; decorative fire must never secretly damage.
- Neither reliable player health, button presses, target selection, resource drain, attack scheduling nor a terminal encounter outcome is visible. Any values or rules for these in the handoff are proposed Ashen design.

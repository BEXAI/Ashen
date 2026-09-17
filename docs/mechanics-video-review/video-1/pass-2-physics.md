# Video 1 — pass 2: movement, contact, and physical presentation

**Completed:** full-frame visual pass of all 240 sequential frames, at 24 fps, from 0.000 through 9.958 seconds of the 10-second rendition. This was chronological inspection of every frame on ten contact sheets, followed by nine full-resolution frame inspections. It was not ordinary continuous audiovisual watching. Audio was not reviewed in this pass.

Source: [user-supplied iCloud reference](https://share.icloud.com/photos/027tMrrBSWfqw1SeFFqWN8iIg). Local rendition: `sources/video-1-preview.mp4`, 3,777,451 bytes, SHA-256 `379f0e15c2545b21d6780c64d25b6fc97b38f0d7aabaefde64833d2a0287dee4`. Frame time is `(one-based frame number − 1) / 24`. Findings concern this downloaded playback rendition, not an independently obtained original master.

## Coverage ledger

Every contact sheet below was opened with `view_image` at original detail and inspected in row-major chronological order. Each contains 24 consecutive frames; none were skipped.

| Coverage ID | Sheet | Frames | Time range | Physics focus |
| --- | --- | --- | --- | --- |
| V1-P2-S00 | `all-frames-00.jpg` | 1–24 | 0.000–0.958 | Enemy closes distance; hero guard; raised enemy weapon. |
| V1-P2-S01 | `all-frames-01.jpg` | 25–48 | 1.000–1.958 | Lowered/turned hero posture, descending enemy attack, first visible spark contact and recovery. |
| V1-P2-S02 | `all-frames-02.jpg` | 49–72 | 2.000–2.958 | Close-range torso turns, successive sword arcs, limited separation. |
| V1-P2-S03 | `all-frames-03.jpg` | 73–96 | 3.000–3.958 | Large hit cue, enemy recoil/recovery, renewed exchange. |
| V1-P2-S04 | `all-frames-04.jpg` | 97–120 | 4.000–4.958 | Repeated overhead preparation and low sweeping follow-through. |
| V1-P2-S05 | `all-frames-05.jpg` | 121–144 | 5.000–5.958 | Hero's raised sword transitions into broad cut; enemy upper-body response. |
| V1-P2-S06 | `all-frames-06.jpg` | 145–168 | 6.000–6.958 | Enemy leans back, hero resets and cuts again, renewed localized hit effects. |
| V1-P2-S07 | `all-frames-07.jpg` | 169–192 | 7.000–7.958 | Follow-through and pause, final renewed cut, enemy folds; victory begins. |
| V1-P2-S08 | `all-frames-08.jpg` | 193–216 | 8.000–8.958 | Enemy collapses toward foreground with dust; hero recovers upright. |
| V1-P2-S09 | `all-frames-09.jpg` | 217–240 | 9.000–9.958 | Corpse remains on floor while dust subsides; standing hero holds lowered sword. |

Full-resolution expansions inspected: `frames/000022.jpg` (0.875), `000026.jpg` (1.042), `000033.jpg` (1.333), `000074.jpg` (3.042), `000097.jpg` (4.000), `000138.jpg` (5.708), `000196.jpg` (8.125), `000202.jpg` (8.375), `000229.jpg` (9.500). These were inspected as original images, not inferred solely from thumbnails.

## Timestamped observations and limits

| ID and time | Direct visual observation | Interpretation and confidence limit |
| --- | --- | --- |
| P2-01 · 0.000–0.750, f1–19 | The horned enemy becomes much closer/larger while the hero holds an upright sword guard in the foreground. Enemy limbs change through running/stepping poses. | Clear visual approach. Camera motion also changes framing, so no world-speed, acceleration, distance, or stride-length measurement is justified. |
| P2-02 · 0.792–1.208, f20–30 | Enemy weapon rises above the shoulder/head. Hero lowers and turns the upper body while drawing the sword across/back. The opponent's raised torso and later downward bend make preparation and execution visibly different. Expanded f22/f26 support the posture change. | Readable anticipation and whole-body participation. A successful input dodge, invulnerability, parry, or true center-of-mass calculation cannot be inferred. |
| P2-03 · 1.250–1.458, f31–36 | A descending/forward enemy motion coincides with the hero's low sweeping movement; f33 has a concentrated bright spark around the enemy's abdomen and a blue arc curving away from that region. The bodies overlap strongly in projection. | A localized hit cue, not proof of exact blade intersection or solid-body collision. Darkness and mutual occlusion prevent resolving feet, grip, and all body surfaces. |
| P2-04 · 1.500–2.958, f37–72 | Fighters remain close while their shoulders/hips turn through further cuts. The enemy repeatedly raises the mace, then bends forward/down; the hero alternates higher guard and low cross-body follow-through. Blue trails persist after the fast motion. | The impression of weight comes mainly from changing stance, anticipation, and recovery. This does not establish a momentum, impulse, or mass model. A persistent trail must not be treated as the current blade position. |
| P2-05 · 3.000–3.458, f73–84 | A strong spark and “−245” cue appear; the enemy's torso/arms open and lean back, then prepare again. At expanded f74 the sword is already held above/left while the blue trail remains near waist height. | Distinct recoil is visible, but the frame sequence does not prove a measurable hit-stop interval or translational knockback impulse. Do not calibrate damage or contact volume from the lingering effect. |
| P2-06 · 4.000–4.958, f97–120 | Another overhead enemy preparation leads into a close low exchange with sparks around 4.542–4.750. Hero knees/torso lower during follow-through and begin returning toward guard. | Supports readable low/high posture variation. No reliable foot-lock or ground-reaction-force conclusion: footwear is dark, partly cropped/occluded, and the camera rotates. |
| P2-07 · 5.000–5.958, f121–144 | The hero visibly raises the sword, then swings broadly across. Enemy torso folds/turns with a localized impact and “−198” around 5.708; expanded f138 shows the effect over the torso. | Supports an animation-driven strike/reaction pair. Whether the enemy was interrupted, still attacking, or playing a separate stagger state is unknown. |
| P2-08 · 6.000–7.458, f145–180 | Enemy remains leaned/recoiled for a period; hero completes a swing, briefly holds a wide stance, and brings the sword back. Another burst around 6.458–6.792 accompanies a broad cut. | Visible recovery matters to readability. This is insufficient to derive exact recovery timers, poise thresholds, hit frequency, or cooldown rules. |
| P2-09 · 7.500–8.458, f181–204 | A renewed cut is followed by the enemy folding and dropping toward the foreground. The combat HUD fades, “Victory” appears, and dust spreads near the floor. Expanded f196/f202 show the collapse still in progress. | Clear death/fall presentation. A preauthored fall could produce this result; there is no evidence that a ragdoll or general rigid-body solver is required. Exact ground-contact instant is masked by dust/body overlap. |
| P2-10 · 8.500–9.958, f205–240 | Hero returns to standing with the sword down. The defeated body remains across the foreground floor while dust thins. Expanded f229 confirms the resting composition. | Persistence and settling are directly visible. No corpse collision, bounce coefficient, friction, or further interaction is demonstrated. |

## Footage reliability and possible illustrative artifacts

- HUD arithmetic is not stable enough for mechanics extraction. Expanded f33 reads `755/1000`; f74 reads `754/1000` with “−245”; after lower intermediate values, f97 again reads `755/1000`. Intermediate frames also deform digits/lettering. This is consistent with illustrative/generated or composited footage, but its production method is unverified.
- The player label remains `HP: 100/100` throughout the visible combat HUD. That alone does not prove perfect defense or invulnerability; the HUD itself is not reliable telemetry.
- Fast weapon/limb silhouettes blur, and effects outlast apparent contact. Dense screen-space overlap is not evidence that bodies or weapons physically interpenetrate in a simulation.
- No obstacle collision, wall slide, stair/slope traversal, jump, unsupported fall, dynamic prop interaction, stamina depletion, directional input, or touch event is visible enough to evaluate.
- Apparent screen movement includes camera orbit/reframing. World-space speed, acceleration, displacement, root-motion distance, collision radius, mass, gravity, and friction cannot be recovered from this pass.

## Design ideas for Ashen — suggestions, not observed engine behavior

1. **Use the sequence of preparation → active sweep → follow-through → guard**, with coordinated torso/hip/knee poses, as the qualitative reference. Ashen already has those timing phases; verify them on the actual imported roster rather than replacing them with a new physics engine by assumption.
2. **Keep real contact sockets authoritative.** Localize impact effects at accepted weapon/body contact and keep trails visual-only. Test moving roots and targets as well as stationary reach; never infer collision from the blue ribbon's extent.
3. **Separate visible recoil from movement displacement.** A bounded authored torso reaction and optional collision-constrained root recoil can reproduce the observed impression. Neither exact recoil distance nor force is supplied by this clip.
4. **Make death finish and settle visibly.** A grounded authored fall followed by a persistent corpse and restrained floor dust matches the visible sequence. Ragdoll, corpse collision, and long persistence are separate product/performance decisions.
5. **Require independent grounding and crowd tests.** The reference hides feet and contact depth too often to validate foot planting, body separation, or collision. Use Ashen's controlled test scenes and actual device footage for those acceptance checks.

No balance constants or new mechanics are adopted by this supporting pass. The final plan should combine these observations with the other three passes and the code baseline, keeping every new design choice explicitly labeled.

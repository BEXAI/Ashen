# Video 1 — pass 1: complete visual overview

Reviewed by root, 17 September 2026. Source: https://share.icloud.com/photos/027tMrrBSWfqw1SeFFqWN8iIg . Local iCloud playback rendition: `sources/video-1-preview.mp4`, SHA-256 `379f0e15c2545b21d6780c64d25b6fc97b38f0d7aabaefde64833d2a0287dee4`. Duration10.000s,24fps,240frames. This is a complete frame-by-frame visual review, not an audio/transcript review or a claim about an underlying game engine.

Coverage: directly inspected `all-frames-00.jpg` through `all-frames-09.jpg` in chronological order; each sheet contains24 consecutive decoded frames. Frames1–240, timestamps0.000–9.958s; last frame displays to10.000s. No frames omitted. Source image2 matches the opening composition.

## Observations

- **0.000–0.708:** A sword-bearing armored human occupies the left foreground of a narrow stone corridor; a horned mace-bearing opponent approaches from the center. The human holds a readable raised guard. Camera follows/orbits enough to keep both actors in view. UI includes HP100/100, two minimaps, two Attack buttons, Defend, Magic, Item; no actual touch gesture is visible.
- **0.750–1.208:** The opponent lifts its mace high and opens its other arm before a descending attack. The human rotates into a cut while lowering its center. Preparation is readable before the close exchange, but camera motion and overlapping silhouettes prevent direct recovery of world-space velocities.
- **1.250–1.458:** The human's blade sweeps across the opponent. A blue blade arc and brief bright contact sparks coincide near the opponent's torso; a label reading Minotaur LV15 and a755/1000-style health value appears. Do not treat this as measured damage math.
- **1.500–2.208:** Both return toward raised weapon poses; the opponent prepares another large mace motion. The repeated preparation/contact/recovery pattern is more useful to Ashen than the exact image-space timings.
- **2.333–3.458:** Further horizontal blue sword arcs, torso flashes/blood-like effects, recoil, and a floating −245 accompany close exchanges. The player's HP remains100/100 in the visible UI. It does not prove an invulnerability, parry, or block mechanic.
- **3.500–5.000:** Camera/actors change orientation while combat continues. Opponent health text becomes inconsistent: a50%-like display is followed by755/1000 again near4.000; later digits distort. Treat the clip as a visual concept/reference rather than a trustworthy numeric combat trace. Sparks remain local to apparent contacts; broad blue trails sometimes extend beyond the blade.
- **5.000–6.958:** Repeated upward/side cuts and pronounced opponent torso reactions. Floating −198 appears after another torso contact near5.708 and remains across subsequent movement. The opponent is pushed/leans sideways; a physical impulse implementation cannot be inferred from this image sequence.
- **7.000–7.958:** Human follows through, resets, then cuts again. HUD fades at about7.750 while Victory begins appearing around7.875, before the complete visible fall. This is an outcome cue to implement from authoritative death state in Ashen, not a screen-timed command to copy.
- **8.000–10.000:** Opponent falls across the foreground with dust. The human settles into a standing recovery pose. Victory and −412 CRITICAL! dominate the top of the image. At the end the corpse rests while dust clears. No actual critical probability, multiplier, input combo, or ragdoll algorithm is demonstrated.

## First-pass lessons to evaluate, not yet final design

1. Readable anticipatory weapon poses, close-range spacing, committed contact, directional recoil, and a distinct recovery communicate weight.
2. Contact-local sparks and brief weapon arcs explain why damage happened; damage/health/outcome presentation must derive from the same gameplay event to avoid the inconsistent overlay behavior visible here.
3. Keep the opponent and its wind-up visible through camera motion and HUD layout; do not copy the duplicate minimaps/Attack buttons or infer that baked overlays are working controls.
4. A grounded, finite death settle is more legible than an endlessly falling corpse. A controlled death animation may satisfy this without ragdoll physics.
5. No evidence here establishes acceleration constants, mass, collision shapes, engine frame stepping, defender input, invulnerability timing, network behavior, or correct target HP arithmetic. Those require explicit Ashen design choices and tests.

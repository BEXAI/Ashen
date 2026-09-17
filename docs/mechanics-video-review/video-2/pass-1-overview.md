# Video 2 — pass 1: complete chronological visual overview

One full frame-contact-sheet overview is complete. This is a visual inspection of every decoded frame in chronological order, **not four playback watches**, and does not include an audio review.

Source: `../sources/video-2.mp4`; original iCloud resource, not a preview transcode. Duration **30.083333 seconds**, **722 decoded video frames**, 720 × 1280, nominal 24 fps. SHA256: `3920cdc537dc69baf3559c8bf9fbd36b906dd814cfa876afcc3e7f864c42af51`. Retrieval details and original filename are in `../sources/video-2.provenance.json`.

Coverage: inspected `all-frames-00.jpg` through `all-frames-30.jpg` using image viewing, left-to-right/top-to-bottom on each page. Frames F0000–F0721, PTS 0.000000–30.041667, cover the full 30.083333-second clip. Pages 00–29 each contain 24 consecutive frames; page 30 contains the last two. Extraction used `-fps_mode passthrough`, without frame-rate downsampling. All 722 full-resolution PNGs remain under `frames/`; their file numbers are one greater than the zero-based F labels. `frame-coverage.json` records exact per-sheet coverage. Additional full-resolution inspection: source files 000001, 000385, 000649, 000697.

The clip presents a continuous vertical third-person melee encounter between a human swordsman and a much larger horned fire demon in an arched stone hall over a glowing, cracked floor. The strongest references are readable weapon preparation, large impact reactions, close camera framing, fire hazards, and low evasive movement. It is a visual concept reference; the source filename says `generated_video`, and temporal shape/text inconsistencies reinforce that interpretation.

## Directly visible presentation

- The armored player occupies the lower foreground; the boss fills most of the upper/middle screen. The camera stays close to the fight, shifting its relative angle/framing as the player moves. There is no demonstrated free-camera input or lock-on toggle.
- Repeated sword actions show preparation, contact-like chest flashes, broad spark fans, recoil and recovery. Several actions raise the sword over the shoulder/head before striking. Exact sword paths and grips drift between frames, so these are reference motions rather than precise animation measurements.
- Fire animates on the boss’s crown, shoulders and hands; orange fissures illuminate its body and the floor. Eruptions rise in front of the combatants around 4.6–6.3 s, 17.7–20 s, and during late ground strikes. These effects partly obscure silhouettes and controls.
- Damage-style labels float above/on the boss, including regular red numbers and larger `Critical!` labels. They frequently persist, duplicate, change or appear without a clean new contact. They are visible feedback decoration; their arithmetic and trigger rules cannot be recovered reliably.
- Hero high-guard posture against a flaming claw around 15.8–16.7 s suggests blocking; the low posture under the sweep around 17.2–18.5 s suggests evasion. No explicit block success, invulnerability, stamina loss, or hit/miss state is displayed.
- The boss gains a clear straight orange blade in its raised hand in the final seconds, after earlier predominantly claw attacks. A fiery overhead slam is a usable visual idea, but weapon emergence may be generated continuity drift rather than a deliberate phase mechanic.
- HUD: hamburger at upper left, circular radar at upper right with green triangle/red dots, large translucent direction control at lower left, five circular action-style buttons at lower right. Several action icons resemble running/dashing; one resembles a fire streak. There are no visible finger contacts or clear button-press highlights linking input to actions. Tiny bottom `HLT`/`RBC`-like labels do not provide readable numerical health/resource bars.

## Chronological coverage log

Each row corresponds to a viewed contact sheet. Times use the actual extracted frame timestamps, rounded to milliseconds.

| Sheet | Zero-based frames | Seconds | Visible events |
|---|---|---|---|
| 00 | F0000–0023 | 0.000–0.958 | Fight already underway. Hero low at screen left, sword forward; horned fire creature leans over him. Existing damage labels float above the boss. Small stance/position changes, no scene cut. |
| 01 | F0024–0047 | 1.000–1.958 | Hero squares toward boss and raises/drives sword upward. A bright chest/neck contact burst appears around 1.333 s; new labels appear as boss opens mouth and spreads arms. |
| 02 | F0048–0071 | 2.000–2.958 | Impact recovery. Hero lowers weapon and shifts left/back; boss turns and extends a claw toward him. Sparks trail away. |
| 03 | F0072–0095 | 3.000–3.958 | Hero repositions with sword low across body; boss leans forward. Critical 511 text appears without an equally clear new contact event. |
| 04 | F0096–0119 | 4.000–4.958 | Short standoff/reposition. A bright floor patch in foreground grows into an upward fire plume from roughly 4.6 s. |
| 05 | F0120–0143 | 5.000–5.958 | Tall foreground fire/lava eruption obscures parts of both figures and right-side buttons. Hero remains upright, guarding/repositioning; no clear damage state is shown. |
| 06 | F0144–0167 | 6.000–6.958 | Hero raises sword into a pronounced high wind-up, steps toward boss, then drives through. Contact light begins near boss chest around 6.875 s. |
| 07 | F0168–0191 | 7.000–7.958 | Large radiating sparks, repeated −145 labels and Critical 678; boss recoils with arms opening. Hero recovers, then begins lifting sword again. |
| 08 | F0192–0215 | 8.000–8.958 | Another high wind-up and forward strike. Bright chest hit begins around 8.667 s; hero ends facing boss with sword extended/upward. |
| 09 | F0216–0239 | 9.000–9.958 | Sparks decay. Boss raises and extends its screen-left claw, with a small orange glow around the hand; hero settles into guarded stance. |
| 10 | F0240–0263 | 10.000–10.958 | Labels change while hero shifts stance and starts another high sword lift. Boss closes distance with raised claws. Number appearance alone does not establish a new hit. |
| 11 | F0264–0287 | 11.000–11.958 | Boss swings its large claw across the hero’s upper area while sword is held high. Hero brings blade down; chest spark burst around 11.583 s, with new −211/−203/−89-style labels. |
| 12 | F0288–0311 | 12.000–12.958 | Hero draws sword across body and up into another long wind-up. Boss arm remains forward before opening away. Motion reads as preparation rather than a separate confirmed hit. |
| 13 | F0312–0335 | 13.000–13.958 | Forward/upward sword delivery; strong central chest burst from about 13.417 s grows into dense sparks. Critical 789 appears as boss throws arms wide. |
| 14 | F0336–0359 | 14.000–14.958 | Long reaction/recovery with chest glow and dispersing sparks. Hero gradually lowers blade. Critical 789 remains over the head throughout much of this interval. |
| 15 | F0360–0383 | 15.000–15.958 | Critical 1024 and −456 replace/add labels around 15.167 s without a distinct new full strike. Boss lifts flaming hand; hero holds sword diagonally high between them. |
| 16 | F0384–0407 | 16.000–16.958 | Flaming claw approaches hero’s raised blade; small contact-like sparks are visible. Hero maintains high guard then lowers into next motion. This suggests a block visually, but no explicit block result/UI state proves it. |
| 17 | F0408–0431 | 17.000–17.958 | Hero dips deeply at knees/waist while boss sweeps a long flaming claw horizontally overhead, then down. Sword remains low; no full somersault/roll is visible. |
| 18 | F0432–0455 | 18.000–18.958 | Boss bends low and reaches/slams toward the ground beside crouched hero. Large floor splashes/fire plumes rise. Hero stays low and moves laterally through foreground. |
| 19 | F0456–0479 | 19.000–19.958 | Low evasive/repositioning motion continues with sword extended near knee height. Boss remains bent forward, then begins rising amid fading eruptions. |
| 20 | F0480–0503 | 20.000–20.958 | Both rise toward a facing standoff. Hero pivots with low sword then returns to higher guard; boss looms frontally. New −203 label appears above head. |
| 21 | F0504–0527 | 21.000–21.958 | Hero begins another high diagonal/overhead preparation while boss reaches toward him. Foreground fire is lower, improving silhouette readability. |
| 22 | F0528–0551 | 22.000–22.958 | Central contact burst around 22.083 s, several −203 labels. Another pulse around 22.833–22.875 s accompanies Critical 1024; exact number of real strike actions is ambiguous. |
| 23 | F0552–0575 | 23.000–23.958 | Repeated short recovery/attack-like upper-body motions. Chest sparks pulse again about 23.708 s and duplicate critical text accumulates. Boss remains upright. |
| 24 | F0576–0599 | 24.000–24.958 | Hero resets and lifts blade into another sweep, followed by a chest flash near 24.917 s. Multiple identical Critical 1024 labels overlap above boss. |
| 25 | F0600–0623 | 25.000–25.958 | Burst expands and fades, −67 labels appear. Hero lowers sword; fire trails down boss torso and between figures. No boss death or health depletion is shown. |
| 26 | F0624–0647 | 26.000–26.958 | Boss raises its screen-left arm high; a straight glowing blade-like form develops near its fist. Hero crouches/moves left with his own sword held low. |
| 27 | F0648–0671 | 27.000–27.958 | Boss lowers raised arm/blade-like form into a groundward strike; flame splash rises around 27.375–27.750 s. Hero turns and moves left/away; this is not a full dodge roll. |
| 28 | F0672–0695 | 28.000–28.958 | Hero continues lateral/retreating steps. Boss rises and clearly raises a straight orange flaming blade overhead by about 28.750 s. Its earlier claw-only appearance has changed. |
| 29 | F0696–0719 | 29.000–29.958 | Boss holds flaming blade overhead, then swings down as hero bends low/away. Ground-level fire splash follows around 29.750 s; damage labels fade. |
| 30 | F0720–0721 | 30.000–30.042 | Final two decoded frames: hero remains low with sword down; boss bent forward over fresh fire splash. Clip ends mid-encounter, with no outcome screen or transition. |

## Observations versus implementation inferences

**Supported visual targets:** large boss-to-player scale contrast; close but readable combat framing; distinct sword preparation and recovery; sharp localized contact flash followed by wider sparks; boss recoil; mobile movement/action controls; glowing floor fissures and localized eruption effects; crouching lateral evasion beneath broad sweeps; a telegraphed raised-arm overhead ground strike.

**Not established by this footage:** exact combo count or directional attack bindings; a parry window; dodge-roll animation or invulnerability frames; stamina/cooldown costs; health totals; critical probability; damage per weapon; true weapon collision; environmental damage; hit-stop; targeting logic; radar tracking accuracy; boss phases; death/loot/reward flow. Sound and music are outside this pass. The clip ends during combat.

**Generated-footage caveats:** boss horns/face/limb proportions and weapon form drift; hero blade/grip and foot contact are not consistently physically constrained; floating text changes or duplicates; radar/action icons remain broadly decorative. These features must not be used as proof that matching mechanics already exist or that exact numerical timings are authoritative. Do not copy apparent foot sliding, UI text drift, prolonged damage labels or ambiguous blade emergence into the game.

Recommended use of this pass: give the later mechanics/combat/camera passes the event ranges above, then design explicit, testable game rules for the inferred systems. Preserve the visual intent while grounding impacts, movement and damage in the actual playable runtime.

# A9 bounded browser review — normal simulation and offline frame sequence

Reviewed runtime `4debae7` on 2026-09-17, using a new isolated Chrome MechanicsLab tab at `http://127.0.0.1:5173/mechanics-lab`. Fixture: **Boss duel (unshielded)**; Lion Knight; **Low** quality; normal system motion preference; impact shake off. All inputs were visible controls: Resume/Pause, Walk left/back/forward/right, Stop, one Heal, ordinary canvas drag, and Mark handoff. No attack, cast, dodge, sprint, hidden state injection, save access, or runtime edit occurred in this session.

**Result:** center and west-side preparations are distinguishable; normal walking escaped three initially occupied eruption disks without damage. At the end-wall/corner, the outward camera crops the hero and warning. An ordinary inward drag makes the next warning and adjacent route readable; the following escape succeeds, though the Dragon subsequently occludes much of the hero/disk. The outward-view failure and later body occlusion remain explicit limits, especially for broader A13 review.

## Method and coverage

- `capture-index.json` indexes the first **137 actual browser screenshots**, and `inward-capture-index.json` indexes **19 follow-up screenshots** (156 total) and their associated visible diagnostics/HUD reads. Each PNG has a same-name JSON receipt with wall-clock capture start/end times. This portable folder includes the selected screenshot/receipt pairs listed in `selected-evidence.json`; the complete raw capture set remains outside the repository in `references/mechanics-implementation/a9-browser-followup/`.
- **46 selected screenshots were visually inspected offline** in four row-major contact sheets, listed exactly in `review-sheets.json`. Their scene-only crop/rescale preserves the captured pixels; labels quote the preceding visible DOM sample. This is a sampled frame sequence reviewed at a slower pace, **not slow-motion engine playback, continuous video, or exhaustive review of all 156 captures**.
- Diagnostics are UI-polled and were read before each screenshot. A screenshot, HUD, and diagnostics may represent nearby different instants. Recorded event timestamps establish simulation contact time; these are not exact contact-frame screenshots.
- Intermediate `06-*`, `07-*`, `08-*`, and `09-*` screenshots used a viewport crop after button scrolling and can omit the upper scene. Exclude them from pose/framing approval. Their visible diagnostics remain useful. In particular, `09-west-sweep-paused` is a historical filename: its recorded boss pattern is null, not sweep.
- `timing-coverage.json` records adjacent visible-DOM sample gaps: center cycle 28 captures across 1.617–7.400 s, maximum 0.617 s; west preparation 24 across 15.533–19.517 s, maximum 0.500 s; inward escape eight across 26.450–27.117 s, maximum 0.267 s. Duplicate DOM times reflect the 250 ms UI polling; screenshot animation poses can still differ. Long pauses and gaps between action groups are not played as continuous time.
- Capture overhead caused dropped simulation time to reach 3.8345 seconds. No performance result is claimed. Later screenshots retained that value through the final frame.

## Observations and evidence

| Evidence (PNG and same-name JSON) | Recorded game time | Observed result / limit |
| --- | --- | --- |
| `01-center-eruption-start`; `02-center-escape-0`, `-4`; `03-center-escape-paused` | 0.117–1.367 s | Opening eruption has a pale fixed floor disk centered on the initial hero position (0, −62.5), radius 1.2. Walk left reaches (−4.153, −62.5); HP remains 140 with no contact event. This opening still uses the procedural boss fallback while roster loading completes. |
| `04-center-cycle-10`, `-11`, `-12`, `-15` | 4.450–5.717 s | Loaded Dragon sweep shows a broad orange directional floor trace and turning arm/wing preparation, then a lowered strike/recovery pose. Standing still receives action 2 melee: 27 HP at simulation 5.0760416666 s. `-12` visibly shows −27 and HUD 113. No evasive input was attempted. |
| `04-center-cycle-20`, `-22`, `-25`, `-26` | 6.450–7.400 s | Slam has a pale circular warning and visibly different raised/body-drop preparation, followed by floor spikes. Hero stays near/outside the outer area and HP stays 113. No claim that walking/dodging caused this miss. A late warning DOM sample may precede a screenshot already showing active effects. |
| `10-west-preparation-00` through selected `-23` | 15.533–19.516 s | Loaded boss approaches along the west wall, then sweep trace/preparation and slam disk remain visible. The stationary hero receives action 6 melee at 18.0593749999 s: −27 visible in `-15`, HP 86→59. Wall-adjacent open floor remains visible. |
| `11-west-warning-paused`; `12-west-escape-0`, `-4` | 19.983–20.950 s | Action 7 slam warning is readable near the west wall, with visible floor route toward the end wall. Walk back traverses it without additional damage. At the paused start the hero is already about 1.55 units from a radius-1.4 disk center, so this proves route traversal, not escape from inside that slam. |
| **`13-west-escape-paused`** | **21.683 s** | **Remaining issue:** hero (−16.658, −56.920) stands at the west/end-wall corner. Diagnostics show action 8 eruption warning centered exactly on the hero, radius 1.2, progress 0.20. The full-page screenshot crops both hero and warning below the canvas; only part of the boss and floor are visible. This is a real framing/readability limit, not the earlier CSS screenshot crop issue. Camera position is (−15.949, 2.904, −56.761), yaw 0, pitch 0.47. |
| `14-wall-corner-eruption-escape-0`…`-6`; `15-final-paused` | 22.100–23.350 s | Walk forward exits action 8's fixed corner disk before its 22.483 s pulse; HP stays 59 and no action-8 contact is recorded. Camera opens as the hero leaves the wall. Mechanical escape succeeds, but the warning at the corner was not visually readable and cannot be accepted as visible counterplay. |

The first session’s final receipt (`15-final-paused`) contains three actual losses: action 2 melee 27, action 5 eruption 27 at 13.983333 s while stationary, and action 6 melee 27. They total 81, matching HP 140→59. No action 1, 3, 4, 7, or 8 contact is recorded. Boss HP stays 620; no death/victory result was exercised. Final body diagnostics contain no invalid or unresolved bodies.

## Bounded inward-camera follow-up

After parent review, one ordinary Heal restored HP 59→140 (flask notice +85, clamped by max HP); Walk back returned near the end wall to (−16.658, −57.370), 0.45 units from the earlier stop. The first drag missed the canvas after button-induced scrolling (`17-*`, yaw remained zero). A fresh visible canvas check followed by an ordinary horizontal drag changed yaw to **+2.310**, without changing pitch .47 or applying automatic orbit.

- **`18-inward-camera-paused`**, game time 26.000: loaded Dragon, hero, full eruption rim and adjacent floor route are clearly visible. Action 10 warning is centered on hero (−16.658, −57.370), radius 1.2, progress .10, pulse due 26.900 s.
- **`19-inward-warning-escape-0`…`-7`**: ordinary Walk right leaves the fixed disk. Warning progress .55, .717 and .95 and active progress .619 are recorded. Hero reaches (−18.550, −60.100). HP stays 140 and no action-10 contact appears. The body/wings then obscure much of the hero and rim, so this is **a readable initial decision/route plus mechanically verified escape**, not continuously unobstructed presentation.
- **`20-inward-final-paused`**, 27.617 s: hazard expired, HP 140, no new damage, no invalid/unresolved body pairs. Camera yaw stays +2.310. The initial inward warning screenshot and subsequent slowed sheet must not be used to call the prior outward view a pass.

## Acceptance interpretation and minimal follow-up

- **A9:** adds timestamped screenshots captured during normal simulation and slower offline inspection of distinct sweep/slam/eruption preparations, the actual loaded Dragon slam, center escape, and wall-adjacent warning/route/escape. All three patterns have representative center and near-wall preparations in these sheets (center opening eruption uses fallback; near-wall eruption uses loaded Dragon). Together with existing pattern/committed-aim tests, this covers the named representative pattern/location observations under a sampled-frame review interpretation. It does not establish smooth continuous timing, every animation frame, or exact screenshot/contact simultaneity; no exhaustive direction/quality/roster matrix is requested or claimed.
- **A9/A13 limits:** ordinary inward camera control restores a readable warning/route where geometry permits. Outward end-wall framing remains cropped, and the boss can occlude the hero during the inward escape. Do not infer that all camera orientations or full A13 location/touch coverage pass. No additional pattern/location is missing from this bounded representative sheet review; if release requires continuous normal/slow playback instead of sampled frames, that exact timing review remains unperformed. This report does not prescribe automatic camera rotation or change collision rules.
- **A11 incidental evidence:** `04-center-cycle-12` and `10-west-preparation-15` provide ordinary-motion, Low-quality readable −27 labels with matching HP/contact receipts. They do not demonstrate actual system reduced motion, all graphics tiers, or particle-free presentation.
- No physical phone/touch, HD, OS-reduced-motion, complete A13 location matrix, five-minute load, or A15 pass is claimed here.

## Deliverables and handoff

- `center-review-sheet.jpg`: opening centered eruption escape, loaded sweep, loaded slam.
- `west-preparation-review-sheet.jpg`: loaded approach/sweep/slam by west wall.
- `wall-escape-review-sheet.jpg`: visible wall slam, corner crop limit, successful corner eruption escape.
- `inward-corner-review-sheet.jpg`: ordinary inward camera turn, readable warning, escape and subsequent body occlusion.
- `review-sheets.json`: exact 46 reviewed screenshot names and crop description; `timing-coverage.json`: explicit sampled timing gaps.
- `selected-evidence.json`: portable selected-file list with sizes and SHA-256 hashes (raw screenshot/receipt pairs plus review sheets/index).
- Owned Chrome tab **1279249676** is left **paused**, no held movement, HP 140 at (−18.550, −60.100), yaw +2.310, and marked handoff. Parent was notified that native-focus/normal-motion work is complete so A11 system-preference testing can proceed separately.

# Development preview canvas sizing — cause and receipt

Runtime implementation: `0fb7a9227cf44ae55566c91826817c7a6900b951`; tested revision `f0552d1f594cb3922fecf3a288d7002fba5db70e` leaves it unchanged. These browser evidence files are intended for the subsequent documentation/evidence commit. This receipt concerns the two development labs, not a change to production rendering.

## Cause and correction

`GameEngine.resize()` calls `renderer.setSize(backingWidth, backingHeight, false)` so rendering resolution can exceed the displayed canvas. The labs used an overflow-hidden `.visual-lab-canvas` host without a CSS width/height for its canvas. High quality therefore displayed the canvas at its large intrinsic dimensions and clipped it to the upper-left masonry view. Low quality usually fit the host and concealed the omission. Production `.world-host canvas` already supplied the required sizing.

The shared rule in `app/game/visual-lab.css` now sizes both development labs correctly:

```css
.visual-lab-canvas canvas { display:block; width:100%; height:100%; }
```

High quality, assets, camera math and render effects remain enabled. Temporary AO/composer/reflection/shadow isolation changes were restored. No camera obstruction, shadow or postprocessing workaround was retained.

## Evidence

| Portable artifact | Observed result and limits |
|---|---|
| [Before image](browser/crowd-gate-hd-camera-issue.png), [diagnostics](browser/crowd-gate-hd-camera-issue.json) | High Silver Knight/Cinder fixture was cropped to stone at tick 496, hero approximately (−.071, 6.495), while ordinary contacts continued |
| [Corrected image](browser/crowd-hd-canvas-fixed.png), [diagnostics](browser/crowd-hd-canvas-fixed.json) | Full room, gate and HD enemy group visible. Backing 3404×2436; display about 780.8705×558.5715 CSS px within a 781×559 host |
| [HD portrait throne](browser/throne-knife-hd-portrait.png), [minimum pitch](browser/throne-portrait-min-pitch.png), [maximum pitch](browser/throne-portrait-max-pitch.png) | Post-fix Knife Rogue/Bone Throne views at normal .47 and .18/.98 pitch. Their adjacent JSON records the HD asset and camera state. These cover this portrait subset, not all camera locations or physical touch |
| [Static HD readiness](browser/static-hd-paused-ready.json), [image](browser/static-hd-paused-ready.png) | Ordinary Visual Lab controls complete HD loading at tick/gameTime zero with no pending installs, without Animate/Start measurement. This also verifies the separately fixed paused benchmark loading path; it is not a performance result |

The corrected crowd image was captured after ordinary hero death. It proves canvas sizing and the visible HD scene, not successful gate traversal or approval of a living Silver Knight animation pose. The release reviewer performed the live same-scene quality comparison and browser captures; this note records the stored evidence.

## Acceptance treatment

Pre-fix High **lab** screenshots, including `boss-shield-hd.png` and `crowd-gate-hd-camera-issue.png`, must not count as visual acceptance for framing, poses or warning readability. Their authoritative contact/resource/progression JSON remains usable within its recorded scenario. This issue does not automatically invalidate production-game or Low captures.

Later boss-center captures are valid scene views but are not synchronized contact-frame evidence: `boss-center-cycle.json` starts at tick 230, while `boss-center-cycle-0.png` shows tick 290. Read contact timing from JSON and use the PNGs for their visible sampled states. They do not complete the normal/slow center-and-wall counterplay requirement.

The CSS fix closes the diagnosed preview cropping defect. Full all-roster visual review, the remaining A13 locations/physical touch checks, and A15 physical iPhone measurements retain the limits in [the release receipt](../MECHANICS_UPDATE_RELEASE.md).

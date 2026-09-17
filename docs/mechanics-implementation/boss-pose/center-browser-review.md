# Center boss browser capture review

Independent visual review of six full-page PNGs with `view_image`, plus their two JSON arrays. Sources: `../browser/boss-center-opening-{0,1,2}.png`, `../browser/boss-center-opening.json`, `../browser/boss-center-cycle-{0,1,2}.png`, and `../browser/boss-center-cycle.json`. This is a review of separate still captures from a normal-input encounter, not continuous video or slow playback. No browser or code was changed by this review.

The fixture is **Boss duel · unshielded**, Lion Knight, Low quality, Desktop width, impact shake off and sound off. The page states normal combat engine/damage/costs and an isolated unsaved encounter; all seals are open.

## Timing and observed sequence

JSON was sampled before screenshot capture. Same-index JSON and PNG are **not simultaneous**: opening JSON times are 0.3667 / 1.3833 / 2.6167 seconds, while visible screenshot diagnostics are 1.3833 / 2.3833 / 3.5833. Cycle JSON times are 3.8333 / 4.8333 / 6.0667, while the screenshots show 4.8333 / 6.0667 / 7.0667. Use the visible diagnostics for each still; do not assign a preparation pose to the earlier same-index JSON phase.

| Still | Direct visual evidence |
| --- | --- |
| opening-0 | Procedural armored fallback boss faces Lion Knight on the center floor. HP is 140/140; no hazard is visible. The loading panel still shows one pending roster install. This is the aftermath of the initial escaped eruption, not a captured eruption warning/pulse. |
| opening-1 | Imported Ember Dragon is present with coherent wings/body and a preparatory pose. A bright orange open sweep arc contrasts with the dark floor. Its near edge extends beyond the canvas, so the entire sweep boundary is not visible. HP remains 140/140. |
| opening-2 | Dragon is low/forward over the hero; a visible **−27** number accompanies HP **113/140**. The sweep preparation arc is gone. The visible contact record identifies one accepted melee hit at 3.31354 seconds for 27 damage. |
| cycle-0 | A complete pale yellow slam outline and translucent disk are clearly visible around the hero, with the dragon bent into a prepared posture. Hero HP remains 113/140. The displayed warning runs from 4.4 to 5.5 seconds at the fixed target near (0, −67.34736), radius 1.4. |
| cycle-1 | The slam disk is gone, the dragon is recovering, and HP is **79/140**. JSON records one accepted hazard contact at exactly **5.5 seconds**, damage **34**, action 3. This matches the HUD change 113→79. The instantaneous pulse, ground-contact pose and floating −34 label fall between captures and are not visually established by this still. |
| cycle-2 | The following eruption has a visible full disk/outline around the hero, with the dragon upright and an arm extended, differing from the captured slam preparation. Visible diagnostics identify eruption action 4, warning 6.7→7.7 seconds, radius 1.2. HP is still 79/140; its pulse is outside this sequence. |

The loaded dragon is the actual recovered mobile GLB, SHA-256 `8e94460d3f09ac6eb6e0f7b20f790d3336e1540e03d774f356f124f76ca0d0cd`, as recorded by the source diagnostics. No obvious large mesh explosion, detached weapon or gross floor sinking is visible in these six sampled poses. They do not resolve every foot/claw because the hero and wings occlude parts of the boss.

## Acceptance contribution

**A9 — partial center-encounter evidence.** The open sweep arc reads differently from the complete slam/eruption disks; the captured dragon preparations also differ. Warning outlines remain visible against the dungeon floor, with open floor to either side at center. The reported initial forward dodge and subsequent no-contact eruption state support one successful dodge escape. The later stationary hero receives a real imported-dragon slam pulse, rather than the earlier tested cancellation after body pressure. The 1.1-second committed slam warning and single pulse are supported by recorded state/contact times. This review does not prove the full animation between stills, the exact physical slam contact instant, or a walking-only escape route. The fallback-to-imported change occurs between stills; absence of a visible pop/contact change during the actual swap is not proven.

**A11 — partial feedback evidence.** The visible melee number −27 exactly matches HP 140→113. The logged slam damage 34 exactly matches HP 113→79, but its floating label was not captured. Readable warning geometry is present in Low quality with shake disabled. The sampled trace contains one accepted melee event and one accepted slam event; it does not establish prolonged event/particle caps or all rejected-contact behavior.

## Explicit limits

This is a centered, unshielded desktop fixture only. It does not complete the required normal/slow review near walls or the Bone Throne, shielded-pattern rejection, every hero/quality/fallback combination, high-quality rendering, reduced-motion system preference, touch occlusion, physical mobile performance, hazard boundary/protection cases, or prolonged combat. Audio was disabled and not reviewed. The first eruption pulse and next eruption pulse, exact slam contact frame, and continuous preparation/recovery timing remain outside the visual sampling. Those acceptance items require their separate tests/captures; this report must not be used to mark all of A9 or A11 complete.

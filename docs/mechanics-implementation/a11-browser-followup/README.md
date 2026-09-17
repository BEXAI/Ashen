# Reduced-motion damage feedback and warning review

The browser regression is fixed at `80aec5f8a446d720c4bee2943fde696a7664f2f4`. Floor-hazard damage numbers now use a separate elevated presentation anchor; the resolved contact, sparks and actual HP loss remain unchanged. The label retains depth testing, the eight-surface cap and .65-second lifetime. Three new tests cover the immutable event, invalid-anchor fallback and real-engine Low/reduced-motion floor pulse. The final independent audit also found that the production red damage overlay ignored the preference; Game now makes its opacity zero under Reduce Motion in `bc9ab699057c23be2339413cb31a1338db92fb65`. An additional test extracts and renders that actual JSX through React with normal/reduced/normal preferences, while the existing engine test preserves hit stop and damage. This overlay check is separate from the lab browser screenshots, which have no production red-overlay element.

## Setup and evidence

An isolated Chrome `/mechanics-lab` tab used the normal engine, Lion Knight, unshielded boss fixture and Low quality. **Reduce Motion was a tab-scoped DevTools CSS media emulation**, not a changed Mac preference or physical iPhone setting. The [override proof](reduced-motion-override-proof.txt) and visible page caption establish the request; although Impact shake was checked deliberately, diagnostics report effective `impactShake: false`. No saved journey was read or changed.

| Capture | Result |
| --- | --- |
| [Before fix](accepted-hit-paused.png) / [DOM](accepted-hit-paused-dom.txt) | At time 1.016667, the first eruption has accepted 27 damage (HP 140→113). Its contact is at floor Y=.2; the old number center at Y=.45 is largely hidden behind the hero's legs. This image is a failing repro. |
| [Warning before accepted hit](postfix-hit-16.png) / [DOM](postfix-hit-16-dom.txt) | The full warning rim and fill remain visible under reduced motion, with HP 140 before the pulse. |
| [Corrected −27](postfix-hit-17.png) / [DOM](postfix-hit-17-dom.txt) | The complete −27 is readable above the hero. HUD shows 113/140; diagnostics record one accepted event at time 1, delta 27 and the unchanged floor contact. The presentation anchor raises the sprite center to floor +3.05. |
| [Later pause](postfix-hit-paused.png) / [DOM](postfix-hit-paused-dom.txt) | By the paused time 1.633333 the number is nearly expired; this later frame is not the readable-number proof. It retains HP 113 and exactly one contact. |
| [Paused escape warning](postfix-warning-paused.png) / [DOM](postfix-warning-paused-dom.txt) | Fresh fixture, time .266667: center (0,−62.5), radius 1.2, warning progress .266667. Hero, rim and adjacent escape floor are readable. Pausing preserves the authoritative warning. |
| [Walking during warning](postfix-escape-05.png) / [DOM](postfix-escape-05-dom.txt) | Normal Walk left leaves the disk; no dodge, sprint, attack or immunity shortcut is used. |
| [After pulse](postfix-escape-10.png) / [DOM](postfix-escape-10-dom.txt) | The pulse occurs at the original center while the hero is outside it. HP stays 140 with no contact event. |
| [Escape complete](postfix-escape-paused.png) / [DOM](postfix-escape-paused-dom.txt) | Time 1.533333, root (−4.510,−62.500), hazard expired, HP 140, no invalid/unresolved bodies or queued commands. |

The [receipt](receipt.json) includes parsed visible diagnostics, runtime source hashes and artifact hashes. Screenshots and UI diagnostics are sampled separately; the 250 ms diagnostics refresh can lag the image. Capture times are retained in [hit timing](postfix-hit-times.json) and [escape timing](postfix-escape-times.json). Exact event time comes from the authoritative contact record, not inferred screenshot simultaneity.

The opening uses the loaded Lion and procedural boss while a ready Dragon waits for a safe action boundary. This is valid feedback/warning-renderer evidence, not imported-Dragon pose approval; the separate [A9 review](../a9-browser-followup/REPORT.md) covers the actual Dragon. Low rendering and reduced motion keep the warning footprint readable and use the same authority tested by the hazard/engine suites. This short desktop sequence does not replace the five-minute physical Safari run, certify every camera angle or measure GPU/frame-time performance.

## Cleanup

The scoped override was [restored to No emulation](reduced-motion-restored-proof.txt), DevTools was closed, and the optional Impact shake checkbox returned off. The [final DOM](cleanup-dom.txt) shows the fixture paused with no held input. Mac accessibility preferences were never changed.

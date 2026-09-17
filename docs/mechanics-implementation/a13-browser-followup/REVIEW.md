# A13 desktop follow-up review

**The three requested desktop views pass their bounded framing/clearance review.** I independently opened all three PNGs with `view_image` and read their DOM diagnostics. No new masonry geometry failure is visible; no code/browser changes or additional capture requests are proposed.

| Capture | Observation and recorded state |
| --- | --- |
| [door-portrait.png](door-portrait.png) · [DOM](door-portrait-dom.txt) | Low, 390 px portrait, ordinary closed-gate fixture. Loaded Lion is visible on the near side of the gate; bars/jamb and foreground floor remain readable, with no visible cut through the masonry. Root (0,5.600), yaw −.42, pitch .47, aspect .598765; camera (−2.61753,5.46078,11.46139). Tick 3478 / 57.9667 s matches the screenshot. |
| [corner-landscape.png](corner-landscape.png) · [DOM](corner-landscape-dom.txt) | Low Desktop width. Hero is outside the two walls at (−18.550,−56.920), with camera inside the room after ordinary user rotation. Both wall surfaces and their corner join remain solid. Yaw 2.31, pitch .47, aspect 1.390681; camera (−13.80611,5.46078,−61.24468). Tick 7523 / 125.3833 s matches the screenshot. |
| [corner-portrait.png](corner-portrait.png) · [DOM](corner-portrait-dom.txt) | Same corrected root and camera/yaw/pitch in portrait (aspect .598765). The narrower frame still shows the hero, ground and exterior wall surfaces without a near-plane slice or disappearance. Tick 9226 / 153.7667 s matches the screenshot. |

All three report HP 140/140, zero pending commands, no unresolved/invalid body pairs, no pending roster install, and the actual Lion mobile SHA `d5815c2e56229d68fed1e4267fab315a2fdae38876760e1596c24d0d445966e7`. Root/camera poses, complete parsed diagnostics and artifact hashes are recorded in [review-evidence.json](review-evidence.json). The portrait and landscape corner camera positions are identical; only projection aspect changed, so these are a useful paired view of the same legal corner.

## Black rectangular patches

The rectangles are consistent with **pre-existing dark burial-niche meshes**, not new holes in the end wall. In this camera angle the repeated panels are on the side-wall plane facing the camera. [world.ts](../../../app/game/world.ts#L50) creates dark grout (`#242626`); lines 88–98 build .08 × .85 × 1.35 boxes at y=2.6 and 5.3, x=±(room.width/2−.5), repeated every 2.1 m. In this throne corner the closest west panel is centered approximately (−18.5,2.6,−57.4), matching the visible rectangle next to the hero; upper panels follow the second height row.

The identical niche-generation block exists in both `git show 4debae7:app/game/world.ts` and `git show 4debae7^:app/game/world.ts`, before the shared masonry fix. [dungeon-art.ts](../../../app/game/dungeon-art.ts) batches those material-bearing boxes and supplies finite, nonblack vertex colors; [dungeon-assets.ts](../../../app/game/dungeon-assets.ts) preserves the loaded source material for non-wall/floor surfaces and applies its existing light map. The evidence supports an intentionally dark flat decorative surface. It does not support a new missing-material, hole, compositor, clipping-plane or collision-regression diagnosis. Earlier paused High hero imagery also already showed these rectangular decorations.

A panel partly occludes the hero’s head at this exact wall-hugging endpoint. That is a visible limitation of the existing shallow decoration placement, not proof that the root is inside the newly corrected masonry. The body and floor remain readable in both corner captures. Do not describe the captures as entirely unobstructed views of every body part, and do not turn this observation into an unrelated art overhaul.

## Acceptance boundary

Together with the retained [landscape gate](../browser/gate-dodge-browser.png), [portrait boss/lower-limb](../browser/boss-portrait-active.png), [center-boss](../browser/boss-center-cycle-0.png), [throne/pitch](../browser/throne-portrait-max-pitch.png) and [shrine-return](../browser/shrine-return-portrait.png) records, these fill the three specifically identified desktop A13 gaps. They support representative named-location framing, not every camera angle or continuous geometric clearance; the existing finite-ray and near-plane tests provide numerical backing. User yaw is retained and no forced orbit is required.

**Physical touch remains unverified.** These desktop fixture images do not show production touch controls, real fingers, Safari device orientation, or finger occlusion of warning/escape paths. Do not mark that clause—or A15’s device performance run—complete from this review. Exact slam contact and all-pattern normal/slow counterplay remain separate A9 evidence.

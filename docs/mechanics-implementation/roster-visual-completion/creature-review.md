# Creature runtime pose review

Reviewed fourteen contact sheets, eight poses per sheet (112 panels): idle 0.500s, forward 0.170s, side 0.250s, diagonal 0.320s, backhand 0.230s, overhead 0.440s, dodge 0.250s, death 0.800s. Reaper and Ogre individual death PNGs were also expanded. All fourteen evidence hashes were independently compared with the current `Ashen/public` source GLBs and match.

## Result

No new blocking gross deformation or duplicated held equipment was found in these sampled views. Ogre club and Skeleton Warrior shield floor intersections remain visible and match previously documented limitations; Reaper also has below-floor geometry in its two reaction samples. These observations do not amount to continuous animation or browser acceptance.

## Per-variant evidence

### golem-hd

Accepted for sampled structure/equipment review. Stone body and limbs remain coherent, with no duplicate weapon or obvious large floor burial. Fallen death sample lies at the floor.

- [Contact sheet](golem-hd/pose-contact-sheet.jpg) · [Evidence](golem-hd/evidence.json)
- Source: `/assets/roster/september-8/models/golem-hd.glb`
- SHA-256: `ee0568d9149267d9ab61bcb7c76fd744ab47ac43b1c5947919f9e3b44d6398aa` (current file verified).

### golem-mobile

Accepted for the same sampled scope. HD/mobile silhouettes and poses match in the reviewed views; no additional mobile defect is visible.

- [Contact sheet](golem-mobile/pose-contact-sheet.jpg) · [Evidence](golem-mobile/evidence.json)
- Source: `/assets/roster/september-8/models/golem-mobile.glb`
- SHA-256: `dc8600e6546b04c3ea647550fc1319c2e3280b8529f885f8f279eebf3ffb26e3` (current file verified).

### shrouded-skeleton-hd

Accepted for sampled structure/equipment review. Bones and shroud stay attached, with no extruded ribbons or duplicate held prop. Crouched attacks compress the robe but do not show a detached appendage. Dodge is visibly airborne; its minimum Y is +0.179m at this sample, which alone does not establish bad continuous grounding.

- [Contact sheet](shrouded-skeleton-hd/pose-contact-sheet.jpg) · [Evidence](shrouded-skeleton-hd/evidence.json)
- Source: `/assets/roster/september-8/models/shrouded-skeleton-hd.glb`
- SHA-256: `8fd67a0d7308d1e6143ead61107dd58a467bb170f0dedf858f62732a50d38667` (current file verified).

### shrouded-skeleton-mobile

Accepted for the same sampled scope. No additional mobile deformation or equipment difference is visible against HD.

- [Contact sheet](shrouded-skeleton-mobile/pose-contact-sheet.jpg) · [Evidence](shrouded-skeleton-mobile/evidence.json)
- Source: `/assets/roster/september-8/models/shrouded-skeleton-mobile.glb`
- SHA-256: `98b3faab258f36587daadc0fa2ecc6f0500d9f7a3b5a73cfedb2e8c569de6342` (current file verified).

### spider-hd

Accepted for sampled structure/equipment review. Abdomen, head, fangs and legs remain coherent; death curls/rolls the body onto its side. No obvious large floor burial or duplicate equipment. The sampled walk and attack silhouettes alone do not establish foot locking or gait continuity.

- [Contact sheet](spider-hd/pose-contact-sheet.jpg) · [Evidence](spider-hd/evidence.json)
- Source: `/assets/roster/recovered-2026-09-17/spider.hd.glb`
- SHA-256: `f474a184942c23e8a677d11380081a63a9d587218a652f449e6022fda4248cc4` (current file verified).

### ogre-hd

Accepted for major sampled body deformation and single-club attachment, with an existing floor-intersection limitation. Fingers, forearm and shoulder retain volume; no former club-to-knee tether or detached shaft is visible. At death 0.800s the club is mostly occluded below the floor while the corpse remains on the surface; all-geometry minimum Y is −1.373m, and the club contact tip is −1.212m. This agrees with the archived review’s explicit body-only grounding policy permitting club/grip floor entry. It is not evidence of body burial and is not a newly introduced defect.

- [Contact sheet](ogre-hd/pose-contact-sheet.jpg) · [Evidence](ogre-hd/evidence.json)
- Source: `/assets/roster/recovered-2026-09-17/ogre.hd.glb`
- SHA-256: `385a47b5e3b27d0203c8ce9e579006e00a8ec31a8fbb5982f4a8714bcd6d0954` (current file verified).

### goblin-hd

Accepted for sampled structure/equipment review. A single cleaver stays attached to the hand; limbs and clothing do not show the earlier large hip/hand spikes. Sampled all-geometry floor minima are within approximately 0.004m of zero, including the fallen death pose.

- [Contact sheet](goblin-hd/pose-contact-sheet.jpg) · [Evidence](goblin-hd/evidence.json)
- Source: `/assets/roster/recovered-2026-09-17/goblin.hd.glb`
- SHA-256: `a7a4b2c7c4f99206345ae65f03f05a39a5eddcc34cc15a91a639ee088881a991` (current file verified).

### reaper-hd

Accepted for major sampled structure and single-scythe attachment, with a floor-intersection limitation. Scythe and frayed robe remain coherent in the viewed attack poses. Dodge 0.250s shows the blade at the floor and all-geometry minimum Y −0.048m. Death 0.800s is a tilted robe/body pose with the shaft extending into the floor; all-geometry minimum Y is −0.195m. The sheet does not show gross body burial or a detached second scythe. These stills do not establish the continuous fall path, exact location of every below-floor vertex, or final long-held corpse stability.

- [Contact sheet](reaper-hd/pose-contact-sheet.jpg) · [Evidence](reaper-hd/evidence.json)
- Source: `/assets/roster/recovered-2026-09-17/reaper.hd.glb`
- SHA-256: `dd6f47ccff71dfa8ad7fe9e6e73920041840a0ea9cbda18e3b3d9a1eea61b36d` (current file verified).

### ogre-mobile

Accepted for the same sampled body/attachment scope as HD, with the same nonzero equipment floor intersection. The club remains a single coherent piece; fingers, shoulder and body show no new mobile deformation. At death 0.800s much of the club is below the floor (all-geometry minimum Y −1.373m; club contact tip −1.212m), while the body remains visibly on the surface. The dodge minimum is −0.011m. These values match HD and the previously documented body-only grounding allowance; they are not a claim of zero penetration.

- [Contact sheet](ogre-mobile/pose-contact-sheet.jpg) · [Evidence](ogre-mobile/evidence.json)
- Source: `/assets/roster/recovered-2026-09-17/ogre.mobile.glb`
- SHA-256: `b0e15300d4d35a02bcadcc50756a20361545ab4612f2605d9317e8160f491d27` (current file verified).

### goblin-mobile

Accepted for sampled structure and single-cleaver attachment. All eight viewed poses retain the HD body silhouette without the previous large hip/hand spikes or an extra blade. No obvious large floor burial is visible; recorded all-geometry minima match HD (worst negative sample approximately −0.0005m).

- [Contact sheet](goblin-mobile/pose-contact-sheet.jpg) · [Evidence](goblin-mobile/evidence.json)
- Source: `/assets/roster/recovered-2026-09-17/goblin.mobile.glb`
- SHA-256: `c1e7a133a130caca6249c2bc7df245b9e46d8886dc5e1029d5b5421d363515bf` (current file verified).

### reaper-mobile

Accepted for sampled major deformation and single-scythe attachment, with the same nonzero floor-intersection limitation as HD. The scythe and frayed cloth remain connected/coherent across the viewed attacks. Dodge 0.250s reaches −0.048m and death 0.800s −0.195m in all-geometry minimum Y; the death shaft visibly enters the floor. No additional mobile-only gross distortion or duplicate scythe is visible. The stills do not isolate every below-floor vertex or prove the continuous fall trajectory.

- [Contact sheet](reaper-mobile/pose-contact-sheet.jpg) · [Evidence](reaper-mobile/evidence.json)
- Source: `/assets/roster/recovered-2026-09-17/reaper.mobile.glb`
- SHA-256: `69a0352aeb31c83cb6eacfbd0c1929e7b09d43096f72384bb17934690d078cd7` (current file verified).

### spider-mobile

Accepted for sampled structure and equipment review. Eight legs, abdomen, head and fangs retain the HD silhouette with no new detached or stretched appendage. The curled death pose remains above the floor (minimum Y +0.0059m); dodge is +0.0252m. Small differences from HD bounds do not create an obvious silhouette or grounding defect in these views. Continuous gait and foot locking remain outside this still-image review.

- [Contact sheet](spider-mobile/pose-contact-sheet.jpg) · [Evidence](spider-mobile/evidence.json)
- Source: `/assets/roster/recovered-2026-09-17/spider.mobile.glb`
- SHA-256: `80f14f828811811e6a0ad80fe5026cca38714eafa41091c1256058056737471e` (current file verified).

### skeleton-warrior-hd

Accepted for sampled body structure and single sword/shield attachment, with an explicit equipment floor-intersection limitation. The complete sword stays rigid and attached rather than forming the earlier fan/comb shape; the shield remains attached to the opposite arm. Bones and garments show no obvious large stretch spike across the eight views. At death 0.800s the shield visibly passes through the floor (all-geometry minimum Y −0.348m), while the fallen body is visible at the surface. This is the archived equipment-excluded grounding limitation, not zero penetration. Dodge and attacks retain one sword and one shield.

- [Contact sheet](skeleton-warrior-hd/pose-contact-sheet.jpg) · [Evidence](skeleton-warrior-hd/evidence.json)
- Source: `/assets/roster/recovered-2026-09-17/skeleton-warrior.hd.glb`
- SHA-256: `e705af58a5a3d72d71c4319359210f7059d9019cc4a48545ac4deaab99e3bd07` (current file verified).

### skeleton-warrior-mobile

Accepted for the same sampled scope and limitation as HD. The reviewed sword, shield, body poses and recorded bounds match HD, with no additional visible mobile deformation or duplicated equipment. Death 0.800s retains the same visible shield floor intersection (minimum Y −0.348m); that accepted limitation remains explicit.

- [Contact sheet](skeleton-warrior-mobile/pose-contact-sheet.jpg) · [Evidence](skeleton-warrior-mobile/evidence.json)
- Source: `/assets/roster/recovered-2026-09-17/skeleton-warrior.mobile.glb`
- SHA-256: `4174baf5e4bf86a28a4229c89c0b56d4aef68fd2a72c9038c7487ba717eb9101` (current file verified).

## Coverage limits

- Golem, Shrouded Skeleton and Ogre show identical silhouettes/bounds/contact endpoints for the four labeled strike samples. These sheets therefore do not demonstrate four distinct attack motions; this review makes no such claim. This alone does not prove a defect in the heavy-enemy attack mapping.
- The captures use the actual runtime installation, actor pose, strike-pose and death-presentation code, but baked triangles are rendered offline with base-color maps and neutral Blender lighting. They do not validate browser PBR appearance, shadows, frame rate, loading behavior, physical devices or combat readability against the dungeon.
- One sample per action cannot establish root continuity, foot sliding, full reaction trajectories, collision timing or behavior between samples. Airborne dodge poses and authored garment folds were not rejected solely for being airborne/folded.
- Ogre’s existing allowance is documented in `Ashen/assets-source/higgsfield/recovered-2026-09-17/review/animated/review-summary.json`: body-only grounding excludes held-hand/equipment vertices; club/grip may pass through the floor. No new threshold was introduced here.

- Skeleton Warrior’s archived review likewise explicitly allows the shield to enter the floor during death under equipment-excluded grounding. The current HD and mobile sheets both show that limitation.

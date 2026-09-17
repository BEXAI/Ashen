# Runtime roster visual completion

All **32 delivered GLBs**—six heroes and ten enemies, each in mobile and HD—and the **three shared procedural fallbacks** were inspected across **35 contact sheets / 286 sampled poses**. Reviewers found no new blocking gross deformation or duplicate held equipment in these samples. Existing equipment/floor intersections remain explicit below; this is sampled geometry acceptance, not a continuous browser, PBR or physical-device review.

The [receipt](receipt.json) binds this evidence to runtime commit `4debae73c5f25a2da1e28d7a8d41389c8003b836`, the active manifest, game-function hashes and each delivered model hash. The [detailed creature review](creature-review.md) records the independent fourteen-sheet subset (112 panels), including expanded Ogre/Reaper death views; the integrating reviewer inspected the remaining hero, mage, Dragon and fallback sheets. Together the reviews cover all 35 sheets.

## Method and sample scope

Unmodified game functions installed each actual runtime actor and evaluated its wrapper, skeleton, grounding, embedded equipment, runtime-added held blades, strike adapter and death presentation. Three.js `getVertexPosition` baked the visible deformed triangles with hierarchy transforms applied. The hashed GLB’s base-color image was used for an offline neutral-light Blender render. Thus these show the current runtime deformation and attached geometry, rather than a separate Blender animation interpretation.

Each model has eight labeled samples: idle .500 s, forward .170 s, side .250 s, diagonal .320 s, backhand .230 s, overhead .440 s, dodge .250 s and death .800 s. Both Dragon tiers and the procedural boss add slam 1.100 s and eruption .850 s: `35 × 8 + 3 × 2 = 286`. Each sheet uses a fixed projection/scale for that actor. The accompanying metadata records pose times, full visible-geometry bounds, triangle/vertex counts and contact endpoints.

The fallback sheets represent the three actual shared rigs (hero, ordinary enemy, boss), not sixteen invented fallback designs. The mobile and HD labels identify source asset tiers; the offline renderer does not reproduce Performance-mode texture upload reduction or browser quality postprocessing.

## Complete sheet index

Every linked sheet below was reviewed. Metadata remains beside each image; the portable copy retains the sheet and measurements, not the bulky intermediate baked-triangle/texture files.

| Character | Mobile sheet / metadata | HD sheet / metadata |
| --- | --- | --- |
| lion-knight | [Sheet](lion-knight-mobile/pose-contact-sheet.jpg) · [Metadata](lion-knight-mobile/evidence.json) | [Sheet](lion-knight-hd/pose-contact-sheet.jpg) · [Metadata](lion-knight-hd/evidence.json) |
| dusk-rogue | [Sheet](dusk-rogue-mobile/pose-contact-sheet.jpg) · [Metadata](dusk-rogue-mobile/evidence.json) | [Sheet](dusk-rogue-hd/pose-contact-sheet.jpg) · [Metadata](dusk-rogue-hd/evidence.json) |
| sage | [Sheet](sage-mobile/pose-contact-sheet.jpg) · [Metadata](sage-mobile/evidence.json) | [Sheet](sage-hd/pose-contact-sheet.jpg) · [Metadata](sage-hd/evidence.json) |
| silver-knight | [Sheet](silver-knight-mobile/pose-contact-sheet.jpg) · [Metadata](silver-knight-mobile/evidence.json) | [Sheet](silver-knight-hd/pose-contact-sheet.jpg) · [Metadata](silver-knight-hd/evidence.json) |
| ranger | [Sheet](ranger-mobile/pose-contact-sheet.jpg) · [Metadata](ranger-mobile/evidence.json) | [Sheet](ranger-hd/pose-contact-sheet.jpg) · [Metadata](ranger-hd/evidence.json) |
| knife-rogue | [Sheet](knife-rogue-mobile/pose-contact-sheet.jpg) · [Metadata](knife-rogue-mobile/evidence.json) | [Sheet](knife-rogue-hd/pose-contact-sheet.jpg) · [Metadata](knife-rogue-hd/evidence.json) |
| golem | [Sheet](golem-mobile/pose-contact-sheet.jpg) · [Metadata](golem-mobile/evidence.json) | [Sheet](golem-hd/pose-contact-sheet.jpg) · [Metadata](golem-hd/evidence.json) |
| shrouded-skeleton | [Sheet](shrouded-skeleton-mobile/pose-contact-sheet.jpg) · [Metadata](shrouded-skeleton-mobile/evidence.json) | [Sheet](shrouded-skeleton-hd/pose-contact-sheet.jpg) · [Metadata](shrouded-skeleton-hd/evidence.json) |
| frost-mage | [Sheet](frost-mage-mobile/pose-contact-sheet.jpg) · [Metadata](frost-mage-mobile/evidence.json) | [Sheet](frost-mage-hd/pose-contact-sheet.jpg) · [Metadata](frost-mage-hd/evidence.json) |
| ember-dragon | [Sheet](ember-dragon-mobile/pose-contact-sheet.jpg) · [Metadata](ember-dragon-mobile/evidence.json) | [Sheet](ember-dragon-hd/pose-contact-sheet.jpg) · [Metadata](ember-dragon-hd/evidence.json) |
| ogre | [Sheet](ogre-mobile/pose-contact-sheet.jpg) · [Metadata](ogre-mobile/evidence.json) | [Sheet](ogre-hd/pose-contact-sheet.jpg) · [Metadata](ogre-hd/evidence.json) |
| reaper | [Sheet](reaper-mobile/pose-contact-sheet.jpg) · [Metadata](reaper-mobile/evidence.json) | [Sheet](reaper-hd/pose-contact-sheet.jpg) · [Metadata](reaper-hd/evidence.json) |
| skeleton-warrior | [Sheet](skeleton-warrior-mobile/pose-contact-sheet.jpg) · [Metadata](skeleton-warrior-mobile/evidence.json) | [Sheet](skeleton-warrior-hd/pose-contact-sheet.jpg) · [Metadata](skeleton-warrior-hd/evidence.json) |
| spider | [Sheet](spider-mobile/pose-contact-sheet.jpg) · [Metadata](spider-mobile/evidence.json) | [Sheet](spider-hd/pose-contact-sheet.jpg) · [Metadata](spider-hd/evidence.json) |
| lich | [Sheet](lich-mobile/pose-contact-sheet.jpg) · [Metadata](lich-mobile/evidence.json) | [Sheet](lich-hd/pose-contact-sheet.jpg) · [Metadata](lich-hd/evidence.json) |
| goblin | [Sheet](goblin-mobile/pose-contact-sheet.jpg) · [Metadata](goblin-mobile/evidence.json) | [Sheet](goblin-hd/pose-contact-sheet.jpg) · [Metadata](goblin-hd/evidence.json) |

| Shared fallback | Sheet | Metadata |
| --- | --- | --- |
| hero | [Sheet](fallback-hero-procedural/pose-contact-sheet.jpg) | [Metadata](fallback-hero-procedural/evidence.json) |
| enemy | [Sheet](fallback-enemy-procedural/pose-contact-sheet.jpg) | [Metadata](fallback-enemy-procedural/evidence.json) |
| boss | [Sheet](fallback-boss-procedural/pose-contact-sheet.jpg) | [Metadata](fallback-boss-procedural/evidence.json) |

## Known intersections and interpretation

- Body-only grounding intentionally excludes equipment that would otherwise prop up a corpse. Ogre death shows club/grip below the floor (all-geometry minimum about −1.373 m; club tip −1.212 m), while the body remains on the surface. Skeleton death shows the attached shield intersecting the floor (about −.348 m). Both tiers reproduce these previously documented limitations.
- Reaper’s sampled dodge/death includes below-floor geometry (about −.048 / −.195 m). The scythe/robe remain coherent; these bounds alone do not identify every penetrating vertex. The detailed review does not claim zero penetration or a continuous fall-path proof.
- All-geometry minima include held/stowed props and clothing; they are not body-only foot measurements. For example, Lion’s sampled idle held blade reaches below the neutral floor. Airborne dodge poses and compressed garment folds are not by themselves evidence of root drift or detachment.
- The four labeled strike samples for Golem, Shrouded Dead and Ogre have identical sampled silhouettes/bounds/endpoints. These particular stills do not establish four distinct attack motions; nor does that alone demonstrate a defect in the heavy-enemy motion mapping.
- The separate boss-pose checks retain their measured source intersection tolerances (approximately −6.8 cm at imported claw/chain and −4.5 cm at fallback boots in that sampled sequence), with the real slam surface contact around +3.5 cm. Do not conflate those body/pose measurements with equipment-inclusive bounds in this archive.

## Acceptance limits

This completes the requested sampled visual inspection of the existing roster’s mobile, HD and fallback geometry at the recorded poses. It supplements the existing [roster contact/tier tests](../../../tests/roster.test.mjs), [guarded loading tests](../../../tests/roster-install-boundary.test.mjs) and [boss-pose tests](../../../tests/boss-pose.test.mjs); it does not replace them. The saved sheets do not prove continuity, foot locking, every intermediate phase, collision timing, seamless model arrival or graphics-tier damage equivalence by themselves.

The neutral offline material setup uses base-color textures and does not reproduce the game’s complete PBR/shadow/postprocessing pipeline, camera constraints, dungeon readability, frame rate, loading or physical device behavior. No continuous browser playback or physical-device acceptance is claimed. The [main release receipt](../../MECHANICS_UPDATE_RELEASE.md) owns aggregate test status and the remaining manual/device boundaries.

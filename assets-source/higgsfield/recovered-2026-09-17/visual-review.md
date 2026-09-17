# Recovered model static review

Actual original GLBs were reviewed from front, quarter and back against the previous runtime geometry. Previous runtime views exclude game-added equipment. This is static asset review, not animation/contact acceptance.

All ten Tripo originals face glTF **+X**: rotate **−90° about glTF +Y** into canonical +Z. The four standard-provider outputs face +Z already. Originals remain unmodified.

| Character | Source facing | Retained equipment / hand | Runtime action |
|---|---|---|---|
| dusk-rogue | +Z | No held weapon; quiver and back straps retained. | Keep runtime held blade. |
| ember-dragon | +Z | Wings, tail, wrist cuffs and hanging chains retained. | Use true claw geometry for contact; wings/tail/chains need intentional weights. |
| frost-mage | +Z | Complete blue-crystal staff retained. | Disable added staff; rigidly bind retained staff and place muzzle at real crystal. |
| goblin | +X | Cleaver retained. | Disable added cleaver; use blade geometry for contact. |
| knife-rogue | +X | Bandolier knives and waist/sheath details retained; hands empty. | Keep runtime handheld dagger. |
| lich | +X | Complete purple-crystal staff retained. | Disable added staff; rigidly bind retained staff and place muzzle at real crystal. |
| lion-knight | +Z | Back-slung sword retained; hands empty. | Keep runtime handheld sword; do not rebind decorative back sword to attacking hand. |
| ogre | +X | Spiked club retained. | Disable added club; rigidly bind recovered club and derive contact from spikes/head. |
| ranger | +X | Bow, string and back quiver retained. | Keep bow attached to LeftHand; align projectile spawn with retained bow. |
| reaper | +X | Complete scythe held diagonally across body; right hand near blade, left hand at lower shaft. | Use recovered scythe without prior old-mesh repair; rigid primary-hand binding plus matching off-hand placement/animation. |
| sage | +X | Complete amber staff retained in left hand. | Disable added right-hand staff; bind actual staff to LeftHand and update muzzle/animation handedness. |
| silver-knight | +X | Left-hip/sheath sword detail retained; hands appear open, no held blade. | Keep runtime handheld sword; leave hip sword with body. |
| skeleton-warrior | +X | Complete sword and painted round shield retained. | Disable both added sword and shield; rigidly bind each to its actual hand. |
| spider | +X | Eight-leg silhouette, eyes, palps and fangs retained. | Use custom eight-leg skeleton; no humanoid rig. |

The **Sage is left-handed with the staff**, while Frost Mage and Lich hold theirs in the right hand. The recovered Reaper uses a complete diagonal scythe with both hands, unlike the prior repaired T-pose source. Weapon sockets must be derived from these actual meshes.

See `visual-review.json`, `original-metadata.json` and `review/*-comparison.jpg` for exact evidence and limitations.

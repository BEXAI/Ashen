# Recovered roster activation matrix

Static source renders are accepted for all 14. Activation remains conditional on the specific equipment/rig checks below; these are not claims that completed animations have passed.

| Character | Activation gate |
|---|---|
| dusk-rogue | Accept static appearance; activation conditional on rig/contact QA. Keep runtime held blade. |
| ember-dragon | Accept static appearance; activation conditional on rig/contact QA. Use true claw geometry for contact; wings/tail/chains need intentional weights. |
| frost-mage | Accept static appearance; hold until original equipment binding replaces added props. Disable added staff; rigidly bind retained staff and place muzzle at real crystal. |
| goblin | Accept static appearance; hold until original equipment binding replaces added props. Disable added cleaver; use blade geometry for contact. |
| knife-rogue | Accept static appearance; activation conditional on rig/contact QA. Keep runtime handheld dagger. |
| lich | Accept static appearance; hold until original equipment binding replaces added props. Disable added staff; rigidly bind retained staff and place muzzle at real crystal. |
| lion-knight | Accept static appearance; activation conditional on rig/contact QA. Keep runtime handheld sword; do not rebind decorative back sword to attacking hand. |
| ogre | Accept static appearance; hold until original equipment binding replaces added props. Disable added club; rigidly bind recovered club and derive contact from spikes/head. |
| ranger | Accept static appearance; hold until original equipment binding replaces added props. Keep bow attached to LeftHand; align projectile spawn with retained bow. |
| reaper | Hold activation until two-hand scythe pose and real blade contact are verified. Use recovered scythe without prior old-mesh repair; rigid primary-hand binding plus matching off-hand placement/animation. |
| sage | Hold activation until left-hand staff/animation/muzzle alignment is corrected. Disable added right-hand staff; bind actual staff to LeftHand and update muzzle/animation handedness. |
| silver-knight | Accept static appearance; activation conditional on rig/contact QA. Keep runtime handheld sword; leave hip sword with body. |
| skeleton-warrior | Accept static appearance; hold until original equipment binding replaces added props. Disable both added sword and shield; rigidly bind each to its actual hand. |
| spider | Hold activation until custom eight-leg rig and fang contact are verified. Use custom eight-leg skeleton; no humanoid rig. |

No severe static body/silhouette regression was found. The main demonstrated integration risks are wrong facing, retained weapons duplicating runtime props, Sage handedness, and Reaper two-hand grip. Animation deformation remains unverified.

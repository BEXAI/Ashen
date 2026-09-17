# Generated character equipment audit

Reviewed the 14 available original GLBs against their source character images on 2026-09-17. Humanoids were viewed from front, three-quarter and back in `pilot-viewer.html`; the spider was checked against its Blender front render. The visible forward direction is +Z for all 14. The viewer overrides material properties, so these views do not establish whether source glow is retained.

| Character | Retained equipment | Missing equipment / concerns |
| --- | --- | --- |
| Lion knight | Large sword slung diagonally across back | Hands empty, matching source pose. No shield in source. |
| Dusk rogue | Quiver/arrows and hip blades | No held weapon visible in source or model. |
| Knife rogue | Knife bandolier | Hands empty, matching source pose. |
| Silver knight | Hip sword | Hands empty. Blade is exposed beside hip. |
| Ranger | Bow, quiver/arrows | Lower bow limb wraps backward awkwardly from left-hand grip; check bow deformation during animation before adding another bow. |
| Sage | Belt book/vials | Amber-crystal staff missing. |
| Frost mage | Robes and costume | Blue-crystal staff missing. |
| Lich | Crown and shoulder skull | Purple-crystal staff missing. |
| Reaper | Scythe | Original scythe was disconnected, inverted beside the robe and not held. See repair below. |
| Skeleton warrior | Helmet, strap and loincloth | Both right-hand sword and left-arm red round shield missing. |
| Ember dragon | Wings, tail, wrist cuffs and dangling chains | Faceted head/wings. Humanoid motion needs wing/tail deformation review. No held weapon required. |
| Golem | Stone body | Open oversized hands replace source fists; otherwise retained. Unarmed in source. |
| Shrouded skeleton | Shroud and exposed skeleton | Pooled cloth hem can drag during motion. Unarmed in source. |
| Spider | Body, fangs and legs | Original Blender material looks overly metallic compared with the dark hairy source. Unarmed. |

## Reaper derived repair

`reaper-equipment-repaired.glb` moves the original disconnected scythe into the right palm and rigidly binds its 683 vertices / 496 triangles to `RightHand`. It adds no weapon geometry. The original remains intact. Body position, normal, joint and weight values are unchanged; materials, textures, UVs, indices and animation bytes are unchanged.

Front, three-quarter and back views now show the shaft passing through the right palm and the blade above the hand. The source rig has no finger bones, so the fingers remain open. The derived GLB passes glTF validation with zero errors; its sole non-root skinned-mesh warning is also present in the original. Runtime attack-pose review remains necessary after retargeting.

`reaper-equipment-repair.json` records source/derived hashes, transformation, affected vertex indices and blade contact points. Contact offsets are in source `RightHand` local centimetres, to retain under the normalized rig wrapper:

- Base: `[-9.509563, -5.535374, -45.974048]`
- Tip: `[-19.130570, 49.992712, -5.376578]`

Exclude the recorded weapon vertices from body-only grounding before optimization or topology remapping. Reproduce the repair with `../tools/repair-reaper-scythe.py` using the local Blender Python environment, which provides NumPy.

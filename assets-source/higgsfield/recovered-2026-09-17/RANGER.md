# Recovered Ranger delivery

The original archived provider model remains `models/ranger-original.glb`. The immutable fitted input is `derived/ranger-rigged.glb` with its measured bow/contact metadata in `derived/ranger-rigging.json`. The final prepared entry is `ranger-manifest-entry.json`; it uses relative delivery paths for the game importer to assign URLs. The bow and `ContactBase`, `ContactTip`, and `EquippedMuzzle` remain embedded on LeftHand.

The source bow/string passed through and was fused to part of the sleeve. The derivative duplicates 136 boundary vertices and remaps the affected faces to coherent bow/body ownership. **All 55,618 original triangle surfaces remain, with unchanged rest positions, normals and UVs.** It has 35,830 runtime vertices versus 35,694 source vertices. No original file is modified. The exact original face IDs and explicit equipment mask are recorded in `ranger-reskin-qa.json` and `derived/ranger-reskinned-rigging.json`.

A continuous torso, cape, arm and leg weight field replaces remote influence islands. The rear cape follows the torso, blending into moving shoulders and arms; it is not cloth simulation. The complete measured wooden bow and string are rigid on LeftHand. All twelve required clip names are present. Four attack names share the same genuine native bow clip, retaining its duration; no four-distinct-attack claim is made. The other motions are genuine native clips retargeted with the target's bone lengths/rest rotations preserved.

Both texture variants retain all source triangles. Mobile caps maps at 1024 and HD at 2048; compact original JPEG streams are retained when already within the cap. `ranger-grounding.json` supplies 65 body/clothing floor samples per clip, excluding the measured bow vertices. The renderer must apply interpolated floor lift. Active firing phase remains 0.69–0.76 with the configured strike yaw; the game importer must test the actual muzzle/projectile behavior.

Eight representative motion poses were visually inspected in `review/ranger-seamsplit-actions/action-contact-sheet.png`: idle, walking, three bow aliases, dodge, hit and death. The former stretched bowstring and sleeve holes are repaired. Dense actual-variant pose and validation results are in `ranger-grounding-qa.json`. Uniform samples do not guarantee continuous extrema or physical-device performance.

## Rebuild

From this package directory:

```sh
node tools/rebuild-ranger.cjs --deps-root /path/to/repository --donors-root /path/to/2026-09-08/models/animations --python /path/to/python-with-numpy-and-pillow
```

This runs `reskin-ranger.py`, `build-ranger.cjs`, `compact-ranger.cjs`, the self-contained `ranger-pipeline/inspect-optimize-glb.cjs`, and `package-ranger.cjs`. No dependencies are installed. Donors can also be resolved from the archived sibling `../2026-09-08/models/animations`, or configured with `ASHEN_DONOR_ROOT`. No cache/user paths are embedded as dependency defaults. Retain the fitted input and metadata, original model/receipts, inventory/runtime configuration, these recipes, `resolve-deps.cjs`, and `ranger-pipeline/`.

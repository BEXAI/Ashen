# Higgsfield character reconstruction

The Ash Knight, Crypt Warden and Ember Sovereign skins reconstruct the completed
Higgsfield concept sheet `a4887158-9444-42f8-9573-ce2581d8495e` as full-volume,
articulated Three.js models. They are not automatically recovered scans or
Unreal Engine assets. Unseen sides are authored interpretations.

- Player and Keeper: Ash Knight, segmented plate, steel helmet and torn cloth.
- Standard enemies: Crypt Warden, bare skull, exposed skin, ribs, bone plating,
  claws and bone mace.
- Hollow King: Ember Sovereign skin, layered obsidian armor, crown, spikes and
  emissive greatsword. Its encounter identity and saved progression stay intact.

`app/game/character-skins.ts` contains the reusable models, material definitions,
joint hierarchy, and scene-scoped texture loader. `world.ts` handles locomotion;
`combat-animation.ts` adds articulated side, diagonal, backhand, and overhead
strikes. The rig now separates the waist, elbows, wrists, and knees. Static
pieces merge by material within each joint. Meshes per model: 27 / 32 / 31.
Triangles remain 9,480 / 15,932 / 10,024. Each actor also has one reusable weapon
trail mesh, hidden in Performance mode and for reduced-motion preferences.

`public/assets/skins/` contains six 512px color textures and six relief textures,
plus the source reference and crop provenance. Material swatches are cropped
from the actual generated image and mirrored to make their edges continuous.
Relief is inferred from luminance, not measured surface geometry; baked lighting
in the original image is not a physically accurate albedo capture. Reference
art is retained for inspection and is not downloaded by the game.

The six texture pairs are shared across actors within a renderer. Approximately
16 MiB of uncompressed RGBA GPU texture memory including mipmaps is the upper
bound for these twelve 512px textures. No extra lights, postprocessing passes,
or transparent armor layers are added. A failed texture request leaves the
colored 3D geometry playable. Renderer teardown disposes texture resources;
late load completions cannot reattach them.

Validation: typecheck, syntax, production build, gameplay/mobile regression
suite, and character geometry/asset tests. Physical iPhone and visual browser
playtesting were not performed for this update.

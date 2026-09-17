# Floor-only shared irradiance derivative

Nine ready lightmaps are in `lightmaps/`. `manifest-proposal.json` retains every
active v10 room GLB URL/hash and its existing UV1 metadata. Only lightmap paths,
lightmap hashes/byte counts and floor-bake provenance change. The suggested new
path is `/assets/dungeon/v11/`; root can choose another unused version.

Integration: copy the nine PNGs to the chosen versioned dungeon directory, copy
the manifest proposal there (adjust its lightmap paths if necessary), then point
DungeonAssets to that manifest. Keep the room GLBs referenced by it as-is. This
retains the pilot's detached legacy fixture. No room geometry or UV1 re-export
is needed. Re-run the existing geometry/lightmap tests against the new manifest
and compare the same passage views in the game before publishing.

The new bake evaluates floor texel world positions rather than interpolating
four corner irradiances. It uses one global fixed-torch patch field and 24 rays
for local geometric visibility. Gates, actors, shrine-state lights and flames
are excluded. The base linear irradiance constants and exposure are unchanged.
This is an approximate patch/contact bake, not a path-traced GI result.

Only floor chart interiors and the padding originally owned by those charts
are writable. `masks/` records that exact allowance. Non-floor chart interiors,
non-floor padding, untouched background and all alpha values remain byte-identical.
All source GLB and lightmap input checksums are verified before and after baking.

Measured result: 24 paired samples over all eight room/passage joins changed
from a maximum 4-level linear RGB8 difference to zero. `report.json` contains
all samples, source/output hashes, UV1 hashes and per-room pixel counts.
`verify.mjs` independently reads files back and checks the protected pixels and
manifest/GLB hashes. The diagnostic `floor-strip-before-after.png` shows old on
the left and new on the right, with irradiance multiplied by eight for visibility.
It is a floor-map diagnostic, not a claim about final in-game lighting.

Rebuild outside Site with `node rebuild.mjs`, then `node verify.mjs`. Both default
to their own artifact directory. `ASHEN_GAME_ROOT` selects the read-only game
input and `FLOOR_BAKE_OUT` selects another output directory outside the game.
The rebuild uses installed Node packages and compiles a local source snapshot;
it performs no network or Higgsfield calls. The completed run took about 20 seconds.

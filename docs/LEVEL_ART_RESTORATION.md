# Floor and wall production asset repair

The reference screenshot shows the original brown cobblestone floor and pale masonry walls. The matching earlier source is `7a94062` (September 17, 2026, 06:25:28 EDT). Those texture files are byte-identical at the later verified mechanics revision `edfebdde372c7189e371fb99669b4a1c97e7f105`; no replacement artwork is required.

The production environment pruner retained room GLBs, lightmaps and GLB-linked dependencies, but omitted maps requested directly by `SurfaceTextures`. Both saved release archives 17 and 18 lacked every floor/wall WebP. Development previews served the complete public directory and therefore did not reveal the packaging failure. One missing map rejects the complete asynchronous surface set, leaving both materials without their intended textures.

Runtime materials and the production pruner now share the same URL selection module. The package retains all thirteen maps used across Performance, Full HD and Ultra: six 1K maps, six 2K maps, and the 4K floor diffuse image (7,111,172 bytes total). Their original pixels, UV repeats, material settings and quality choices are unchanged. Unused authoring variants remain in source.

Regression checks cover preservation of each surface map, missing-map failure before any pruning, changed or mismatched URL policy rejection, and exact source-to-production image hashes for every quality setting. Collision, combat, character models, level geometry and saves are unchanged. Publication and visual verification are recorded in the release receipt outside the source checkout.

# Dungeon masters

Editable modular rooms with contiguous xatlas UV1 charts. Each room uses a 1024px linear indirect map (passages 256px), six atlas-pixel padding (over three shipped pixels) and edge dilation. UV1 remains Float32 through compression to preserve chart boundaries. Fixed-torch patch irradiance and 24-ray local visibility are baked offline. This is an approximation, not path-traced GI. Actors, gates and shrine-state lighting are excluded. Source geometry and materials are in dungeon-art.ts/world.ts.

# Character masters

The full-resolution editable master is each character's `.gltf`, `.bin` and four 4096px PNG maps. The companion `.glb` is a portable preview with 512px embedded maps. Runtime GLBs retain the tiered texture sizes in the manifest. External master maps avoid storing their full bytes twice.

Editable detailed reconstructions with xatlas UVs, 4096px master textures, 32-ray geometric occlusion, MikkTSpace tangents, bevels, rivets, curved ribs and folded cloth. Generated Higgsfield diffuse fields are retained in assets-source/materials with provenance; they are artistic textures, not measured PBR scans. Normal and roughness fields are separately authored. These are not new premium anatomical sculpts. Full rendered 360-degree and deformation review remains required. Runtime variants and memory estimates are in the v9 manifest.

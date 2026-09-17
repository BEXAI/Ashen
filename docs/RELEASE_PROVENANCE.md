# Current release scope

The current source includes the September 8 roster, graphics/mobile follow-up, and fourteen recovered meshes plus the September 17 Bone Throne. See [RECOVERED_ASSET_RELEASE.md](RECOVERED_ASSET_RELEASE.md) for this integration’s acceptance and publication status. See [ROSTER_RELEASE.md](ROSTER_RELEASE.md) for coverage, implementation and current limitations. The previous integrated visual update was published before this roster work; its candidate records below are retained as historical evidence, not current publication status. Physical-device acceptance remains unverified.

# Historical pre-publication visual candidate

The integrated source uses character manifest v11, environment prop manifest v2 and dungeon manifest v13. It has not yet established final build/archive acceptance, a matching saved Site version, successful deployment or physical iPhone 17 Safari performance. G05–G08 remain pending in [release-readiness.json](visual-upgrade/release-readiness.json). Earlier v10/42-test/83-test release reports are historical evidence, not results for this tree.

## Asset authorship and immutable receipts

The [current asset ledger](../assets-source/props/v2/release-ledger.json) maps every A01/A02/A03 source project/revision, committed editable Blender file, current recipe and public runtime URL to measured hashes and bytes. The per-asset production ledgers remain unchanged historical operation receipts. One successful authoring operation was recorded for each original prop. No catalog meshes or external texture packs were used for these three props. Source/release notices are in [THIRD_PARTY_NOTICES.txt](../public/THIRD_PARTY_NOTICES.txt).

A01’s integrated package/validation recipe files differ from their initial recorded checksums. The release ledger records both the original receipts and current file hashes; it does not claim a fresh full re-export with those modified scripts. Runtime GLBs live under public asset URLs, while source/bake masters remain under assets-source. Their absence as source-folder siblings is intentional. A03 source project/revision are bound by manifest/source hashes, with no embedded source extras in its runtime root.

Higgsfield balance checkpoints remained 4113.5 before/after these operations. The observed debit is 0; confirmed invoiced usage is unavailable. The authorized shared ceiling was 1000 credits and two authoring attempts per asset. Historical terms/tool review is retained in [production-workflow.json](../assets-source/props/v1/production-workflow.json); this reconciliation makes no fresh pricing or licensing determination.

## Verified artifact evidence

[environment-verification.json](visual-upgrade/environment-verification.json) checks all six prop variants, nine dungeon GLBs and nine lightmaps against active/source hashes and byte sizes. Exact Meshopt-decoded geometry returned zero errors and zero warnings across 15 validation copies. The three compressed props each retain six raw KTX2-format warnings in the installed validator; those warnings and unsupported-extension infos are reported, not suppressed. Embedded PNG pixels are decoded; KTX2 headers/mip payload ranges are inspected without claiming GPU transcoding.

The sconce, shrine and architecture fallback atlas sets occupy 2,097,148, 8,738,128 and 4,194,300 discrete full-mip RGBA8 bytes: 15,029,576 bytes total (14.333320617675781 MiB), below 16 MiB. These bounds exclude CPU/driver copies, render targets and concurrent variant overlap. Runtime diagnostics sum the three imported families against 10 main-pass draws/25,000 triangles; offline assets alone do not prove actual submissions.

Dungeon v13 preserves existing UV1 and v11 indirect maps. Its [derivation record](../assets-source/dungeon-v13/arch-removal.json) records 984 matched legacy visual triangles removed from each of entry/cinder/dusk and 3384 from crown. Active-room totals sum to 137,582 triangles/44 material draws across all nine scenes; this is not a single rendered-frame count. The entry file retains 144 valid detached legacy triangles, excluded from active-scene counts.

## Build and release evidence still required

The source block packer now includes editable .blend files. The environment pruner follows all four active loader constants, mixed-version manifests and external GLB resources, verifies retained inputs before mutation, and removes only unused generated dungeon/prop files. Its copied-real-asset test preserved 26 closure files and removed 60 obsolete files/29,299,506 bytes in a temporary tree. The integrating owner reports a successful clean reconstruction of all 41 packed source assets. Final production build, pruned archive and hosting-size evidence are still pending.

The [accepted reference slice](visual-upgrade/reference-slice-review.json) records desktop Chromium low/30 FPS samples and actual exported character/prop review. Full-room review is being completed separately by the integrating task. Physical iPhone 17 Safari results are empty in [device-results.json](visual-upgrade/device-results.json); OS version is not supplied, and older-iPhone/Android coverage is missing. No verified mobile frame-rate, battery or thermal claim is made.

G05 needs final integrated checks/build evidence. G06 needs actual-device evidence or an explicitly accepted limitation while keeping that missing evidence visible. G07 needs matching pushed source/archive/saved-version records for the new candidate. The previous public release and its rollback version were freshly reconfirmed by the integrating owner; exact identifiers are in release-readiness.json. G08 needs the authorized deployment operation to report success. Until then this document describes an integrated release candidate only.

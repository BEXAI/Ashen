# Ashen Realm visual update

The update increases chamber visibility, replaces repeated dungeon fixtures with authored Higgsfield assets, refines the Sovereign rig and character presentation, and adds clearer combat feedback with optional camera shake. Mobile Auto now reduces optional work in stages and exports detailed local timing/resource history.

## Installed scope

- Lighting: five chamber profiles, continuous passage transitions, reachable torch selection, neutral reflection fill, default brightness with a durable 85–130% control, and corrected fallback material colors.
- Character presentation: refined Sovereign shoulders/cape, protected active weapon tracks, bounded transition blending, distance-calibrated gait and leg-only stance correction. The engine retains root movement, damage and strike timing.
- Environment: original Higgsfield A01 sconces, A02 Ember Shrines and A03 arches/pillars/trim. Source projects, successful operations, editable Blender masters, bake recipes and runtime hashes are retained. The visible imported prop budget is 10 draws/25,000 triangles; full-mip RGBA8 fallback atlases total 14.33332 MiB.
- Surface continuity: projected masonry UV0, preserved UV1, corrected static floor indirect seams and exact removal of replaced legacy visual geometry. Gate collision and progression remain unchanged.
- Combat/camera: strike-driven directional windup cues, accepted-contact impacts, bounded trails, frame-independent follow and optional rotation-only shake; reduced motion overrides shake.
- Mobile: nearby character detail protection, stable tier replacement, staged Auto load/recovery decisions and an isolated graphics check page with explicit desktop-versus-phone reporting.
- Full stack: graphics preferences stay local and outside Progress v1. Save/API/identity/origin/conflict contracts and D1 schema remain unchanged.

## Evidence and limits

Actual browser captures and comparisons are indexed in `visual-review.json`; hash/budget validation is in `environment-verification.json`. `stance-comparison.json` records 84 translated/turned Low-rig cases and 48 active-strike cases. Measured active socket changes were zero; continuous turns still have bounded slip. `asset-reproducibility.json` records exact clean restoration of all 41 packed large assets. Required integrated checks are recorded separately in `automated-validation.json`.

Desktop Chromium measurements and screenshots are engineering evidence only. The user can test iPhone 17 Safari, but OS version, physical frame times, touch comfort, thermal/15-minute soak and additional older-iPhone/Android coverage remain pending. Auto thresholds are provisional. Performance mode keeps a simpler water surface, and the existing stylized knight/Warden assets remain distinct from the more detailed Sovereign.

## Publication record

This document describes the source candidate at build time. `release-record.json` records the verified previous live rollback target and the publication procedure. The terminal release receipt outside the checkout supplies the exact pushed source, built archive, saved version and succeeded deployment after publication. A source document cannot embed its own future commit SHA. Player data is never reverted by visual rollback.

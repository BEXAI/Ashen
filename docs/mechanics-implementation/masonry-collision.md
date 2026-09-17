# Rendered masonry and collision alignment

Runtime/tested revision: `4debae73c5f25a2da1e28d7a8d41389c8003b836`.

The normal boss encounter exposed a real mismatch between the visible architecture and the previous floor-union controller. At (−18.55, −67.259), a legal hero root overlapped the west pilaster centered at (−18.65, −67), width .7 and depth .9. At (−18.55, −56.45), the hero also overlapped the .9-deep north end wall. The original shell BVH omitted the pilaster; changing camera postprocessing could not correct an actor inside masonry.

`ROOM_ARCHITECTURE` now supplies the same end walls, doorway posts, pilasters and capitals to rendering and solid envelopes. Ground movement includes the 72 floor-level boxes. Finite obstruction segments also include overhead lintels and capitals, with rounded corners conservatively enclosed by their .06–.10-unit outer boxes. Side-wall floor boundaries, gates and Bone Throne retain their existing authorities. Broad-phase bounds skip distant masonry before exact swept-circle or slab calculations. Rendered assets and their placement are unchanged; asynchronous replacement does not alter collision.

The four new regressions in `tests/architecture-collision.test.mjs`:

- Reject the three previously accepted embedded roots, including the old south-corner hazard fixture. The existing saved-spawn validation will move such a saved hero to the safe camp without changing progression.
- Sweep every movement radius against the pillar and end wall, retain tangent sliding, preserve all native enemy/objective positions and the complete center route through every room join, and keep overhead lintels out of ground collision.
- Compare finite obstruction distances against actual visible world meshes, with inside-solid and beyond-endpoint controls, and verify the production engine includes these solids.
- Verify desired and interpolated camera near-plane clearance against a pillar.

The A10 escape test now uses a valid north/east throne-room corner. Both overhead active and recovery still reject placement when walls and living body starts jointly prevent escape, and accept after the blockers are removed. This corrects the fixture's previous masonry overlap rather than weakening its assertions.

| Capture | Observation |
|---|---|
| [West-wall warning](browser/wall-sweep-warning.png), [state](browser/wall-sweep-warning.json) | Before the fix, the boss and sweep warning are visible but the hero overlaps the pilaster |
| [Retreat](browser/wall-sweep-retreat.png), [state](browser/wall-sweep-retreat.json) | Ordinary walking retreats along the west wall without new damage; HP remains 110. The north corner compresses the camera and exposes the end-wall mismatch |
| [User camera turn](browser/corner-camera-inward.png), [state](browser/corner-camera-inward.json) | Normal dragging toward the room restores a view of the Dragon. User yaw is retained; no forced orbit or actor relocation is used to satisfy framing |
| [Corrected pillar stop](browser/pillar-collision-fixed.png), [state](browser/pillar-collision-fixed.json) | The post-fix ordinary controller stops at (−17.85, −72.637), in front of the visible pillar; imported Lion Knight remains outside the masonry, HP 140, no invalid/unresolved bodies |

The corrected browser capture uses Low quality in the isolated no-enemy throne fixture, with normal movement and a loaded hero. It is not the five-minute physical iPhone run, a new all-roster review, or a claim that every corner angle shows both actors. The plan prioritizes collision safety over framing and leaves yaw/pitch under user control.

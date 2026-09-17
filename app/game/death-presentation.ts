import * as T from 'three';

export const DEATH_HOLD_SECONDS = 3;
export const DEATH_FADE_SECONDS = .75;
export const DEATH_REACTION_SECONDS = .8;
export type DeathFrame = { poseTime: number; opacity: number; complete: boolean };

/** Pure finite timeline. This does not kill, reward, save, or advance game time. */
export function sampleDeathPresentation(elapsed: number, clipDuration = DEATH_REACTION_SECONDS): DeathFrame {
  const duration = Number.isFinite(clipDuration) ? Math.max(0, clipDuration) : DEATH_REACTION_SECONDS;
  const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const fadeStart = duration + DEATH_HOLD_SECONDS;
  return { poseTime: Math.min(time, duration), opacity: 1 - T.MathUtils.clamp((time - fadeStart) / DEATH_FADE_SECONDS, 0, 1),
    complete: time >= fadeStart + DEATH_FADE_SECONDS };
}

/** Structural subset of Actor: both loaded roster and procedural fallback work. */
type DeathActor = {
  group: T.Group;
  body: T.Object3D;
  visual?: { reaction: (kind: 'hit' | 'dodge' | 'death', elapsed: number) => void; resetPresentation: () => void };
};
type MaterialOwner = T.Object3D & { material: T.Material | T.Material[] };
type MaterialBinding = { owner: MaterialOwner; original: T.Material | T.Material[]; replacement: T.Material | T.Material[] };

/** Call sample(simulatedDeathAge) in gameplay OR advance(presentationDt) under
 * terminal overlays, never both for the same elapsed interval. The engine owns
 * suspension on ordinary pause, visibility and context loss. It may stop render
 * scheduling when complete. Loaded reactions retain their authored grounding.
 */
export class DeathPresentation {
  private elapsed = 0;
  private bindings: MaterialBinding[] = [];
  private materials = new Map<T.Material, T.Material>();
  private basePosition: T.Vector3;
  private baseRotation: T.Euler;
  private bounds = new T.Box3();
  private worldPosition = new T.Vector3();
  private frame: DeathFrame = sampleDeathPresentation(0);

  constructor(private readonly actor: DeathActor, private readonly groundY: number,
    private readonly clipDuration = DEATH_REACTION_SECONDS) {
    this.basePosition = actor.body.position.clone(); this.baseRotation = actor.body.rotation.clone();
  }

  sample(elapsed: number): DeathFrame {
    this.elapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : this.elapsed;
    this.frame = sampleDeathPresentation(this.elapsed, this.clipDuration);
    const { actor } = this;
    // reaction() expects its established .8 s death window, independent of a
    // chosen presentation duration. The asset adapter samples its own native clip.
    const progress = this.clipDuration > 0 ? this.frame.poseTime / this.clipDuration : 1;
    if (actor.visual) actor.visual.reaction('death', Math.min(1, progress) * DEATH_REACTION_SECONDS);
    else {
      actor.body.position.copy(this.basePosition); actor.body.rotation.copy(this.baseRotation);
      actor.body.rotation.z += Math.sin(Math.min(1, progress) * Math.PI / 2) * Math.PI / 2;
      actor.group.updateWorldMatrix(true, true);
      this.bounds.setFromObject(actor.group, true);
      if (Number.isFinite(this.bounds.min.y) && Number.isFinite(this.groundY)) {
        actor.body.getWorldPosition(this.worldPosition);
        this.worldPosition.y += this.groundY - this.bounds.min.y;
        if (actor.body.parent) actor.body.parent.worldToLocal(this.worldPosition);
        actor.body.position.copy(this.worldPosition);
      }
    }
    if (this.frame.opacity < 1) this.cloneMaterials();
    for (const [original, copy] of this.materials) copy.opacity = original.opacity * this.frame.opacity;
    actor.group.visible = !this.frame.complete;
    return this.frame;
  }

  advance(dt: number): DeathFrame {
    return this.sample(this.elapsed + (Number.isFinite(dt) ? Math.max(0, dt) : 0));
  }
  get complete(): boolean { return this.frame.complete; }
  get age(): number { return this.elapsed; }

  /** Explicit respawn/re-entry only; disposing alone does not resurrect a corpse. */
  reset(): void {
    this.restoreMaterials(); this.elapsed = 0; this.frame = sampleDeathPresentation(0, this.clipDuration);
    this.actor.body.position.copy(this.basePosition); this.actor.body.rotation.copy(this.baseRotation);
    this.actor.group.visible = true; this.actor.visual?.resetPresentation();
  }
  dispose(): void { this.restoreMaterials(); }

  private cloneMaterials(): void {
    const clone = (original: T.Material) => {
      let material = this.materials.get(original);
      if (!material) {
        material = original.clone(); material.transparent = true; material.depthWrite = false;
        this.materials.set(original, material);
      }
      return material;
    };
    this.actor.group.traverse(object => {
      const owner = object as MaterialOwner;
      if (!owner.material || this.bindings.some(b => b.owner === owner && b.replacement === owner.material)) return;
      const original = owner.material;
      const replacement = Array.isArray(original) ? original.map(clone) : clone(original);
      this.bindings.push({ owner, original, replacement }); owner.material = replacement;
    });
  }
  private restoreMaterials(): void {
    for (const { owner, original, replacement } of this.bindings) if (owner.material === replacement) owner.material = original;
    for (const material of this.materials.values()) material.dispose();
    this.bindings.length = 0; this.materials.clear();
  }
}

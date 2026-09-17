import * as T from 'three';

export const CAMERA_CLEARANCE_RADIUS = .20;
export const MAX_ENCOUNTER_FOCUS_OFFSET = 1.5;
export const MAX_ENCOUNTER_EXTRA_DISTANCE = 1.2;
export type CameraObstruction = (from: T.Vector3, to: T.Vector3) => number;
export type ClearanceOptions = { near?: number; fovDegrees?: number; aspect?: number; radius?: number };
export type ClearanceResult = { obstructed: boolean; distance: number; probes: number };

/** Center, edge and corner ray bundle enclosing the near plane and .20 m box.
 * `obstruction` must include the same architecture, gates and throne as movement,
 * and return first hit distance (Infinity if clear). Mutates only camera position.
 * Call once on desired position, then AGAIN after follow interpolation and after
 * any positional shake. Use the unshaken look target for this conservative box.
 * This is a bounded probe approximation, not an exact arbitrary-mesh volume cast.
 */
export function clearCameraPosition(target: T.Vector3, position: T.Vector3,
  obstruction: CameraObstruction, options: ClearanceOptions = {}): ClearanceResult {
  const direction = position.clone().sub(target), distance = direction.length();
  if (!Number.isFinite(distance) || distance < 1e-8) return { obstructed: false, distance: 0, probes: 0 };
  direction.divideScalar(distance);
  const near = Math.max(.001, finite(options.near, .1));
  const radius = Math.max(0, finite(options.radius, CAMERA_CLEARANCE_RADIUS));
  const nearHalfY = near * Math.tan(T.MathUtils.degToRad(T.MathUtils.clamp(finite(options.fovDegrees, 55), 1, 175)) / 2);
  const halfY = Math.max(radius, nearHalfY);
  const halfX = Math.max(radius, nearHalfY * Math.max(.01, finite(options.aspect, 1)));
  const right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), direction);
  if (right.lengthSq() < 1e-10) right.set(1, 0, 0); else right.normalize();
  const up = new T.Vector3().crossVectors(direction, right).normalize();
  const from = new T.Vector3(), to = new T.Vector3(), offset = new T.Vector3();
  const margin = Math.max(radius, near), skin = .02;
  let allowed = distance, probes = 0;
  for (const [x, y] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    offset.copy(right).multiplyScalar(x * halfX).addScaledVector(up, y * halfY);
    from.copy(target).add(offset); to.copy(position).add(offset).addScaledVector(direction, margin);
    const hit = obstruction(from, to); probes++;
    if (Number.isFinite(hit)) allowed = Math.min(allowed, Math.max(0, hit - margin - skin));
  }
  if (allowed < distance) position.copy(target).addScaledVector(direction, allowed);
  return { obstructed: allowed < distance, distance: allowed, probes };
}

function finite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/** Focus inputs are world-space aim points (hero chest, boss chest), NOT actor
 * roots. Output is reused; consume before the next call. Yaw and pitch are never
 * touched. Apply camera clearance after composing the returned framing.
 */
export class EncounterFraming {
  private offset = new T.Vector3();
  private desiredOffset = new T.Vector3();
  private focus = new T.Vector3();
  private extra = 0;
  private result = { focus: this.focus, extraDistance: 0 };

  update(heroAim: T.Vector3, bossAim: T.Vector3 | null, dt: number, reducedMotion = false) {
    this.desiredOffset.set(0, 0, 0);
    let desiredExtra = 0;
    if (bossAim) {
      this.desiredOffset.subVectors(bossAim, heroAim).multiplyScalar(.35);
      const horizontal = Math.hypot(this.desiredOffset.x, this.desiredOffset.z);
      if (horizontal > MAX_ENCOUNTER_FOCUS_OFFSET) {
        const ratio = MAX_ENCOUNTER_FOCUS_OFFSET / horizontal;
        this.desiredOffset.x *= ratio; this.desiredOffset.z *= ratio;
      }
      this.desiredOffset.y = T.MathUtils.clamp(this.desiredOffset.y, -.5, 1.2);
      desiredExtra = T.MathUtils.clamp((heroAim.distanceTo(bossAim) - 4) * .18, 0, MAX_ENCOUNTER_EXTRA_DISTANCE);
    }
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const alpha = 1 - Math.exp(-elapsed * (reducedMotion ? 1.5 : 4));
    this.offset.lerp(this.desiredOffset, alpha); this.extra += (desiredExtra - this.extra) * alpha;
    this.focus.copy(heroAim).add(this.offset);
    this.result.extraDistance = this.extra;
    return this.result;
  }
  reset(): void { this.offset.set(0, 0, 0); this.extra = 0; }
}

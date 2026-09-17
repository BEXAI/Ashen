import * as T from 'three';
import type { Actor } from './character-skins';
import type { Strike, StrikeId } from './combat';

type Rotation = readonly [number, number, number];
type Pose = { torso: T.Quaternion; arm: T.Quaternion; elbow: T.Quaternion; wrist: T.Quaternion; offhand: T.Quaternion; offElbow: T.Quaternion };
const q = (angles: Rotation) => new T.Quaternion().setFromEuler(new T.Euler(...angles));
function pose(torso: Rotation, arm: Rotation, elbow: number, wrist: Rotation, offhand: Rotation = [-.28, .1, .18], offElbow = -.55): Pose {
  return { torso: q(torso), arm: q(arm), elbow: q([elbow, 0, 0]), wrist: q(wrist), offhand: q(offhand), offElbow: q([offElbow, 0, 0]) };
}
const guard = pose([0, 0, 0], [-.35, -.1, -.15], -.45, [.35, 0, 0]);
const keys: Record<StrikeId, readonly [Pose, Pose, Pose]> = {
  side: [
    pose([-.03, -.44, .035], [-1.12, -.7, -.7], -.55, [.85, -.15, .15], [-.2, .2, .5]),
    pose([.06, .38, -.035], [-1.12, .50, .68], -.18, [.72, .08, -.15], [-.35, -.1, .2]),
    pose([.03, .18, 0], [-.72, .28, .35], -.40, [.50, 0, 0]),
  ],
  diagonal: [
    pose([-.05, -.35, -.07], [-2.02, -.48, -.50], -.80, [.18, -.12, .15], [-.45, .1, .4]),
    pose([.12, 0, .02], [-.92, -.10, -.08], -.24, [.64, -.1, -.15], [-.25, -.1, .3]),
    pose([.04, .06, .02], [-.6, .12, .14], -.4, [.5, 0, 0]),
  ],
  backhand: [
    pose([-.02, .4, -.03], [-1.15, .68, .72], -.64, [.90, .1, -.2], [-.4, -.2, .12]),
    pose([.06, -.35, .04], [-1.08, -.65, -.50], -.2, [.76, -.1, .15], [-.25, .2, .48]),
    pose([.02, -.12, 0], [-.65, -.25, -.2], -.38, [.48, 0, 0]),
  ],
  overhead: [
    pose([-.08, -.1, -.03], [-2.25, -.12, -.24], -.82, [.30, 0, 0], [-1.25, .2, .50], -.85),
    pose([.18, .08, .01], [-.92, -.12, -.1], -.28, [.63, 0, 0], [-.7, .1, .32], -.65),
    pose([.07, .04, 0], [-.56, -.1, -.12], -.4, [.45, 0, 0], [-.4, .1, .2]),
  ],
};
const ease = (v: number) => { const t = T.MathUtils.clamp(v, 0, 1); return t * t * (3 - 2 * t); };

export function applyStrikePose(actor: Actor, strike: Strike, elapsed: number) {
  const [wind, contact, follow] = keys[strike.id];
  let a = guard, b = wind, blend = elapsed / strike.windup;
  if (elapsed >= strike.windup + strike.active + strike.recovery * .45) {
    a = follow; b = guard; blend = (elapsed - strike.windup - strike.active - strike.recovery * .45) / (strike.recovery * .55);
  } else if (elapsed >= strike.windup + strike.active) {
    a = contact; b = follow; blend = (elapsed - strike.windup - strike.active) / (strike.recovery * .45);
  } else if (elapsed >= strike.windup) {
    a = wind; b = contact; blend = (elapsed - strike.windup) / strike.active;
  }
  const k = ease(blend);
  actor.torso.quaternion.slerpQuaternions(a.torso, b.torso, k);
  actor.arms[1].quaternion.slerpQuaternions(a.arm, b.arm, k);
  actor.elbows[1].quaternion.slerpQuaternions(a.elbow, b.elbow, k);
  actor.wrists[1].quaternion.slerpQuaternions(a.wrist, b.wrist, k);
  actor.arms[0].quaternion.slerpQuaternions(a.offhand, b.offhand, k);
  actor.elbows[0].quaternion.slerpQuaternions(a.offElbow, b.offElbow, k);
  actor.wrists[0].rotation.set(.12, 0, 0);
  const load = Math.sin(T.MathUtils.clamp(elapsed / (strike.windup + strike.active + strike.recovery), 0, 1) * Math.PI);
  actor.legs[0].rotation.set(-.10 * load, 0, 0);
  actor.legs[1].rotation.set(.07 * load, 0, 0);
  actor.knees[0].rotation.set(.16 * load, 0, 0);
  actor.knees[1].rotation.set(.07 * load, 0, 0);
  actor.body.position.y = -.012 * load;
}

export function bladeSegment(actor: Actor, base: T.Vector3, tip: T.Vector3) {
  actor.group.updateMatrixWorld(true);
  base.set(0, -.28, .015); tip.set(0, actor.group.userData.skin === 'crypt-warden' ? -1.18 : -1.43, .015);
  actor.sword.localToWorld(base); actor.sword.localToWorld(tip);
}

export function combatFootwork(actor: Actor, moving: number, time: number) {
  const stride = Math.sin(time * 9) * moving * .28;
  actor.legs[0].rotation.x += stride; actor.legs[1].rotation.x -= stride;
  actor.knees[0].rotation.x += Math.max(0, -stride) * .9;
  actor.knees[1].rotation.x += Math.max(0, stride) * .9;
}

// A fixed-size world-space ribbon follows the actual weapon; no new meshes per swing.
export class WeaponTrail {
  readonly mesh: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
  private positions = new Float32Array(12 * 6);
  private colors = new Float32Array(12 * 6);
  private times = new Float32Array(12);
  private count = 0;
  constructor(scene: T.Scene, color = '#e6c693') {
    const geometry = new T.BufferGeometry(), indices: number[] = [];
    for (let i = 0; i < 11; i++) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    geometry.setAttribute('position', new T.BufferAttribute(this.positions, 3).setUsage(T.DynamicDrawUsage));
    geometry.setAttribute('color', new T.BufferAttribute(this.colors, 3).setUsage(T.DynamicDrawUsage));
    geometry.setIndex(indices); geometry.setDrawRange(0, 0);
    this.mesh = new T.Mesh(geometry, new T.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity: .26, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
    this.mesh.name = 'weapon motion trail'; this.mesh.frustumCulled = false; this.mesh.visible = false; scene.add(this.mesh);
  }
  reset() { this.count = 0; this.mesh.visible = false; this.mesh.geometry.setDrawRange(0, 0); }
  sample(base: T.Vector3, tip: T.Vector3, now: number) {
    this.positions.copyWithin(6, 0, 66); this.times.copyWithin(1, 0, 11);
    base.toArray(this.positions, 0); tip.toArray(this.positions, 3); this.times[0] = now;
    this.count = Math.min(12, this.count + 1); this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, Math.max(0, this.count - 1) * 6);
  }
  update(now: number, hidden = false) {
    this.mesh.visible = !hidden && this.count > 1 && now - this.times[0] < .12;
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.count; i++) { const alpha = Math.max(0, 1 - (now - this.times[i]) / .12); this.colors.fill(alpha * alpha, i * 6, i * 6 + 6); }
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

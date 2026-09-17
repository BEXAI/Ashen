export type StrikeId = 'side' | 'diagonal' | 'backhand' | 'overhead';
export type Strike = {
  id: StrikeId; label: string; windup: number; active: number; recovery: number;
  stamina: number; damage: number; targets: number; stagger: number; travel: number;
};

// Seconds, not frames. Gameplay and the weapon pose share this one timeline.
export const STRIKES: readonly Strike[] = [
  { id: 'side', label: 'Side cut', windup: .17, active: .16, recovery: .25, stamina: 8, damage: 1, targets: 2, stagger: .16, travel: .16 },
  { id: 'diagonal', label: 'Diagonal cut', windup: .23, active: .18, recovery: .27, stamina: 10, damage: 1.15, targets: 2, stagger: .22, travel: .23 },
  { id: 'backhand', label: 'Backhand', windup: .15, active: .16, recovery: .25, stamina: 8, damage: .95, targets: 2, stagger: .14, travel: .12 },
  { id: 'overhead', label: 'Overhead strike', windup: .34, active: .20, recovery: .37, stamina: 15, damage: 1.55, targets: 1, stagger: .42, travel: .30 },
];
export const strikeDuration = (strike: Strike) => strike.windup + strike.active + strike.recovery;
export type Swing = { strike: Strike; elapsed: number; speed: number; facing: number; hits: Set<string>; sounded: boolean };
export function createSwing(strike: Strike, facing: number, speed = 1): Swing {
  return { strike, facing, speed, elapsed: 0, hits: new Set(), sounded: false };
}
export function swingPhase(swing: Swing): 'windup' | 'active' | 'recovery' {
  return swing.elapsed < swing.strike.windup ? 'windup' : swing.elapsed < swing.strike.windup + swing.strike.active ? 'active' : 'recovery';
}
export function activeInterval(strike: Strike, from: number, to: number): [number, number] | null {
  const start = Math.max(from, strike.windup), end = Math.min(to, strike.windup + strike.active);
  return end > start ? [start, end] : null;
}
export function swingStep(swing: Swing, dt: number): { from: number; to: number; done: boolean } {
  const from = swing.elapsed;
  swing.elapsed = Math.min(strikeDuration(swing.strike), from + Math.max(0, dt) * swing.speed);
  return { from, to: swing.elapsed, done: swing.elapsed >= strikeDuration(swing.strike) };
}
export function travelBetween(strike: Strike, from: number, to: number) {
  const interval = activeInterval(strike, from, to);
  return interval ? (interval[1] - interval[0]) / strike.active * strike.travel : 0;
}

export class AttackSequence {
  swing: Swing | null = null;
  private next = 0;
  private comboUntil = 0;
  private queuedUntil = -1;
  queue(now: number) { this.queuedUntil = now + .20; }
  clearInput() { this.queuedUntil = -1; }
  cancel() { this.swing = null; this.next = 0; this.comboUntil = 0; this.clearInput(); }
  nextStrike(now: number) { return STRIKES[now > this.comboUntil ? 0 : this.next]; }
  start(now: number, stamina: number, facing: number, held = false): Swing | null {
    if (this.swing || (!held && now > this.queuedUntil)) return null;
    const strike = this.nextStrike(now);
    if (stamina < strike.stamina) return null;
    this.clearInput();
    this.next = (STRIKES.indexOf(strike) + 1) % STRIKES.length;
    this.swing = createSwing(strike, facing);
    return this.swing;
  }
  finish(now: number) { this.swing = null; this.comboUntil = now + .8; }
}

export type Point3 = { x: number; y: number; z: number };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
// Closest distance between a blade segment and a vertical body capsule.
// Scalar math avoids temporary vectors for each enemy and each swept sample.
export function bladeHitsCapsule(a: Point3, b: Point3, x: number, z: number, radius: number, low: number, high: number): boolean {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vy = high - low;
  const rx = a.x - x, ry = a.y - low, rz = a.z - z;
  const aa = ux * ux + uy * uy + uz * uz, ee = vy * vy;
  const bb = uy * vy, cc = ux * rx + uy * ry + uz * rz, ff = vy * ry;
  let s = 0, t = 0;
  if (aa <= 1e-12 && ee <= 1e-12) return rx * rx + ry * ry + rz * rz <= radius * radius;
  if (aa <= 1e-12) t = clamp(ff / ee);
  else if (ee <= 1e-12) s = clamp(-cc / aa);
  else {
    const denominator = aa * ee - bb * bb;
    s = denominator > 1e-12 ? clamp((bb * ff - cc * ee) / denominator) : 0;
    t = (bb * s + ff) / ee;
    if (t < 0) { t = 0; s = clamp(-cc / aa); }
    else if (t > 1) { t = 1; s = clamp((bb - cc) / aa); }
  }
  const dx = rx + ux * s, dy = ry + uy * s - vy * t, dz = rz + uz * s;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

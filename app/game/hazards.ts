/** Authoritative floor attacks. This module never changes health or consumes presentation time. */
export type FloorPoint = Readonly<{ x: number; z: number }>;
export type HazardKind = 'slam' | 'eruption';
export const HAZARD_BOUNDARY_EPSILON = 1e-6;
export type HazardSpec = Readonly<{
  id: string; ownerId: string; actionId: string; kind: HazardKind;
  center: FloorPoint; radius: number; warningSeconds: number; activeSeconds: number;
  damageMultiplier: number;
}>;
export type HazardSnapshot = Readonly<{
  id: string; ownerId: string; actionId: string; kind: HazardKind;
  center: FloorPoint; radius: number; damageMultiplier: number;
  startedAt: number; warningEndsAt: number; activeEndsAt: number;
  gameTime: number; phase: 'warning' | 'active'; warningProgress: number; activeProgress: number;
  pulseEmitted: boolean;
}>;
export type HazardHeroSample = Readonly<{ id: string; x: number; z: number; alive: boolean }>;
/** A geometry candidate, not accepted damage. Resolve protection/armor/death ordering centrally. */
export type HazardPulseCandidate = Readonly<{
  id: string; hazardId: string; actionId: string; ownerId: string; targetId: string;
  kind: HazardKind; time: number; center: FloorPoint; target: FloorPoint;
  radius: number; damageMultiplier: number; requestsMeleeHitStop: false;
}>;
export type HazardQuery = {
  /** Supply exact contact-time state/path samples, not end-of-tick roots. */
  heroAt: (time: number) => HazardHeroSample | null;
  ownerAliveAt: (ownerId: string, time: number) => boolean;
  /** Includes architecture, closed gates and throne. Protection is handled by the resolver. */
  lineOfSight: (from: FloorPoint, to: FloorPoint, time: number) => boolean;
};
type LiveHazard = { spec: HazardSpec; startedAt: number; warningEndsAt: number; activeEndsAt: number; pulseEmitted: boolean };
const finitePoint = (p: FloorPoint) => Number.isFinite(p.x) && Number.isFinite(p.z);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const copyPoint = (p: FloorPoint): FloorPoint => Object.freeze({ x: p.x, z: p.z });
function validTime(n: number) { if (!Number.isFinite(n) || n < 0) throw new RangeError('Expected finite nonnegative game time'); }

/** Hero ROOT CENTER only: no implicit movement/hurt radius expansion. Tangency is included. */
export function insideHazardDisk(point: FloorPoint, center: FloorPoint, radius: number): boolean {
  if (!finitePoint(point) || !finitePoint(center) || !Number.isFinite(radius) || radius < 0) return false;
  const dx = point.x - center.x, dz = point.z - center.z;
  return dx * dx + dz * dz <= radius * radius + HAZARD_BOUNDARY_EPSILON;
}

export class HazardSystem {
  private live: LiveHazard | null = null;
  private clock: number;
  private stopped = false;
  constructor(gameTime = 0) { validTime(gameTime); this.clock = gameTime; }
  get gameTime() { return this.clock; }
  get occupied() { return this.live !== null; }
  /** Start AFTER advancing the system to this tick's start; never silently replace a live warning. */
  start(spec: HazardSpec, gameTime = this.clock): boolean {
    validTime(gameTime);
    if (gameTime < this.clock) throw new RangeError('Hazard clock cannot run backwards');
    if (this.stopped || this.live) return false;
    if (!spec.id || !spec.ownerId || !spec.actionId || !finitePoint(spec.center) ||
      !Number.isFinite(spec.radius) || spec.radius <= 0 || !Number.isFinite(spec.warningSeconds) || spec.warningSeconds <= 0 ||
      !Number.isFinite(spec.activeSeconds) || spec.activeSeconds <= 0 ||
      !Number.isFinite(spec.damageMultiplier) || spec.damageMultiplier <= 0 || !['slam', 'eruption'].includes(spec.kind)) {
      throw new RangeError('Invalid hazard specification');
    }
    this.clock = gameTime;
    const safeSpec = Object.freeze({ ...spec, center: copyPoint(spec.center) });
    this.live = { spec: safeSpec, startedAt: gameTime, warningEndsAt: gameTime + spec.warningSeconds,
      activeEndsAt: gameTime + spec.warningSeconds + spec.activeSeconds, pulseEmitted: false };
    return true;
  }
  /** Absolute GAME time; equal time is a no-op (pause/hit-stop safe). Large steps retain the exact pulse. */
  advance(toGameTime: number, query: HazardQuery, exclusiveEnd = false): HazardPulseCandidate[] {
    validTime(toGameTime);
    if (toGameTime < this.clock) throw new RangeError('Hazard clock cannot run backwards');
    this.clock = toGameTime;
    const h = this.live;
    if (this.stopped || !h) return [];
    const out: HazardPulseCandidate[] = [];
    if (!h.pulseEmitted && (exclusiveEnd ? toGameTime > h.warningEndsAt + 1e-10 : toGameTime >= h.warningEndsAt)) {
      h.pulseEmitted = true; // Consume the one pulse even when missed, blocked, protected or subsequently rejected.
      const t = h.warningEndsAt, hero = query.heroAt(t);
      if (query.ownerAliveAt(h.spec.ownerId, t) && hero?.alive &&
        insideHazardDisk(hero, h.spec.center, h.spec.radius) && query.lineOfSight(h.spec.center, hero, t)) {
        out.push(Object.freeze({ id: `${h.spec.id}:pulse:${hero.id}`, hazardId: h.spec.id, actionId: h.spec.actionId,
          ownerId: h.spec.ownerId, targetId: hero.id, kind: h.spec.kind, time: t,
          center: copyPoint(h.spec.center), target: copyPoint(hero), radius: h.spec.radius,
          damageMultiplier: h.spec.damageMultiplier, requestsMeleeHitStop: false as const }));
      }
    }
    // Contact-time life is used above; the resolver rechecks earlier lethal events in its ordered batch.
    if (!query.ownerAliveAt(h.spec.ownerId, toGameTime) || toGameTime >= h.activeEndsAt) this.live = null;
    return out;
  }
  snapshot(): HazardSnapshot | null {
    const h = this.live;
    if (!h || this.stopped) return null;
    return Object.freeze({ id: h.spec.id, ownerId: h.spec.ownerId, actionId: h.spec.actionId, kind: h.spec.kind,
      center: copyPoint(h.spec.center), radius: h.spec.radius, damageMultiplier: h.spec.damageMultiplier,
      startedAt: h.startedAt, warningEndsAt: h.warningEndsAt, activeEndsAt: h.activeEndsAt, gameTime: this.clock,
      phase: this.clock < h.warningEndsAt ? 'warning' : 'active',
      warningProgress: clamp01((this.clock - h.startedAt) / h.spec.warningSeconds),
      activeProgress: clamp01((this.clock - h.warningEndsAt) / h.spec.activeSeconds), pulseEmitted: h.pulseEmitted });
  }
  cancelOwner(ownerId: string) { if (this.live?.spec.ownerId === ownerId) this.live = null; }
  cancel() { this.live = null; }
  reset(gameTime = 0) { validTime(gameTime); this.clock = gameTime; this.live = null; }
  dispose() { this.cancel(); this.stopped = true; }
}

/** Integration supplies the SAME controller/action limits and stationary-body/world constraints as gameplay. */
export type WalkEscapeAdapter<State> = {
  snapshot: State;
  clone: (state: State) => State;
  currentIntent: FloorPoint;
  /** Mutate the cloned state; advance existing action/recoil, with no new attacks/dodge/sprint. */
  step: (state: State, dt: number, walkIntent: FloorPoint) => void;
  position: (state: State) => FloorPoint;
  /** Validate full movement-body clearance, not just the center. Called on every simulation substep. */
  legal: (state: State) => boolean;
};
export type WalkEscapeResult = Readonly<{ headingIndex: number; heading: FloorPoint; end: FloorPoint; duration: number }>;
/** Conservative bounded search, no guessed speed budget and no bypass of action movement caps. */
export function findWalkEscape<State>(adapter: WalkEscapeAdapter<State>, center: FloorPoint, radius: number,
  warningSeconds: number): WalkEscapeResult | null {
  if (!finitePoint(center) || !finitePoint(adapter.currentIntent) || !Number.isFinite(radius) || radius <= 0 ||
    !Number.isFinite(warningSeconds) || warningSeconds <= .20 || warningSeconds > 10) return null;
  const maxStep = 1 / 60;
  for (let headingIndex = 0; headingIndex < 16; headingIndex++) {
    const angle = headingIndex * Math.PI / 8, heading = Object.freeze({ x: Math.sin(angle), z: Math.cos(angle) });
    const state = adapter.clone(adapter.snapshot);
    if (!adapter.legal(state) || !finitePoint(adapter.position(state))) continue;
    let elapsed = 0, valid = true;
    while (elapsed < warningSeconds - 1e-12) {
      const reaction = elapsed < .20 - 1e-12;
      const boundary = reaction ? .20 : warningSeconds;
      const dt = Math.min(maxStep, boundary - elapsed, warningSeconds - elapsed);
      if (dt <= 0) break;
      adapter.step(state, dt, reaction ? adapter.currentIntent : heading);
      elapsed += dt;
      if (!adapter.legal(state) || !finitePoint(adapter.position(state))) { valid = false; break; }
    }
    const end = adapter.position(state);
    if (valid && !insideHazardDisk(end, center, radius + .15)) {
      return Object.freeze({ headingIndex, heading, end: copyPoint(end), duration: warningSeconds });
    }
  }
  return null;
}

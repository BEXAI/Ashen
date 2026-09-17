import type { FloorPoint, HazardSpec } from './hazards';

export type BossPatternId = 'sweep' | 'slam' | 'eruption';
export type BossPatternDefinition = Readonly<{
  id: BossPatternId; windup: number; active: number; recovery: number;
  damageMultiplier: number; travel: number; maxRange: number; radius: number;
  pose: 'side' | 'overhead'; contact: 'socket' | 'hazard';
}>;
export const BOSS_NEUTRAL_SECONDS = .35;
export const ERUPTION_START_COOLDOWN = 4;
/** Proposed Ashen tuning. Slam pulses at windup end; its .35 s VFX overlaps recovery. */
export const BOSS_PATTERNS: readonly BossPatternDefinition[] = Object.freeze([
  Object.freeze({ id: 'sweep', windup: .80, active: .20, recovery: .65, damageMultiplier: 1, travel: .20, maxRange: 3.2, radius: 0, pose: 'side', contact: 'socket' }),
  Object.freeze({ id: 'slam', windup: 1.10, active: 0, recovery: .85, damageMultiplier: 1.25, travel: 0, maxRange: 3.2, radius: 1.40, pose: 'overhead', contact: 'hazard' }),
  Object.freeze({ id: 'eruption', windup: 1, active: .35, recovery: .70, damageMultiplier: 1, travel: 0, maxRange: 8, radius: 1.20, pose: 'overhead', contact: 'hazard' }),
]);
export type BossPatternAction = Readonly<{
  id: string; ownerId: string; pattern: BossPatternDefinition; facing: number;
  target: FloorPoint; startedAt: number; windupEndsAt: number; activeEndsAt: number; endsAt: number;
  hazard: HazardSpec | null;
}>;
export type BossPatternContext = {
  gameTime: number; ownerId: string; boss: FloorPoint; hero: FloorPoint;
  alive: boolean; heroAlive: boolean; shielded: boolean; encounterActive: boolean;
  hazardAvailable: boolean;
  lineOfSight: (from: FloorPoint, to: FloorPoint) => boolean;
  legalFloor: (point: FloorPoint) => boolean;
  canEscape: (center: FloorPoint, radius: number, warningSeconds: number) => boolean;
  /** Must validate the actual imported/fallback pose can reach this locked floor point. */
  slamReachable: (point: FloorPoint) => boolean;
  /** Optional authored ground contact; evaluated once before LOS, floor and escape gates. */
  slamTarget?: (boss: FloorPoint, hero: FloorPoint) => FloorPoint | null;
  /** Optional additional real socket feasibility gate; NEVER pads damage reach. */
  sweepReachable?: (point: FloorPoint) => boolean;
  /** Use the engine's shared monotonic action IDs when available. Called only on accepted starts. */
  allocateActionId?: () => string;
};
const finitePoint = (p: FloorPoint) => Number.isFinite(p.x) && Number.isFinite(p.z);
function validTime(time: number) { if (!Number.isFinite(time) || time < 0) throw new RangeError('Invalid boss game time'); }

export class BossPatternController {
  private next = 0;
  private serial = 0;
  private clock = 0;
  private readyAt = 0;
  private lastEruptionStart = -Infinity;
  private running: BossPatternAction | null = null;
  get action() { return this.running; }
  get nextPattern(): BossPatternId { return BOSS_PATTERNS[this.next].id; }
  get nextDecisionAt() { return this.readyAt; }
  /** No action auto-starts here. Tick owner chooses a new intent from the next snapshot. */
  advance(gameTime: number): BossPatternAction | null {
    validTime(gameTime);
    if (gameTime < this.clock) throw new RangeError('Boss clock cannot run backwards');
    this.clock = gameTime;
    if (this.running && gameTime >= this.running.endsAt) {
      const done = this.running; this.running = null;
      this.readyAt = done.endsAt + BOSS_NEUTRAL_SECONDS;
      return done;
    }
    return null;
  }
  tryStart(context: BossPatternContext): BossPatternAction | null {
    this.advance(context.gameTime);
    if (!context.alive || !context.heroAlive || context.shielded || !context.encounterActive) {
      this.cancel(context.gameTime); return null;
    }
    if (this.running || context.gameTime < this.readyAt || !context.ownerId ||
      !finitePoint(context.boss) || !finitePoint(context.hero)) return null;
    const distance = Math.hypot(context.hero.x - context.boss.x, context.hero.z - context.boss.z);
    if (!context.lineOfSight(context.boss, context.hero)) { this.readyAt = context.gameTime + BOSS_NEUTRAL_SECONDS; return null; }
    for (let offset = 0; offset < BOSS_PATTERNS.length; offset++) {
      const index = (this.next + offset) % BOSS_PATTERNS.length, pattern = BOSS_PATTERNS[index];
      if (distance > pattern.maxRange) continue;
      if (pattern.id === 'eruption' && context.gameTime < this.lastEruptionStart + ERUPTION_START_COOLDOWN) continue;
      if (pattern.id === 'sweep' && context.sweepReachable && !context.sweepReachable(context.hero)) continue;
      const selected = pattern.id === 'slam' && context.slamTarget ? context.slamTarget(context.boss, context.hero) : context.hero;
      if (!selected || !finitePoint(selected)) continue;
      const target = Object.freeze({ x: selected.x, z: selected.z });
      if (pattern.contact === 'hazard' && (!context.hazardAvailable || !context.lineOfSight(context.boss, target) || !context.legalFloor(target) ||
        (pattern.id === 'slam' && !context.slamReachable(target)) ||
        !context.canEscape(target, pattern.radius, pattern.windup))) continue;
      const id = context.allocateActionId?.() ?? `${context.ownerId}:boss:${++this.serial}`;
      if (!id) throw new Error('Boss action ID must be nonempty');
      const hazard: HazardSpec | null = pattern.contact === 'hazard' ? Object.freeze({
        id: `${id}:floor`, ownerId: context.ownerId, actionId: id, kind: pattern.id === 'slam' ? 'slam' : 'eruption',
        center: target, radius: pattern.radius, warningSeconds: pattern.windup, activeSeconds: .35,
        damageMultiplier: pattern.damageMultiplier,
      }) : null;
      this.running = Object.freeze({ id, ownerId: context.ownerId, pattern,
        facing: Math.atan2(target.x - context.boss.x, target.z - context.boss.z), target,
        startedAt: context.gameTime, windupEndsAt: context.gameTime + pattern.windup,
        activeEndsAt: context.gameTime + pattern.windup + pattern.active,
        endsAt: context.gameTime + pattern.windup + pattern.active + pattern.recovery, hazard });
      this.next = (index + 1) % BOSS_PATTERNS.length;
      if (pattern.id === 'eruption') this.lastEruptionStart = context.gameTime;
      return this.running;
    }
    // Reposition for a bounded interval; invalid placements never reroll on every render.
    this.readyAt = context.gameTime + BOSS_NEUTRAL_SECONDS;
    return null;
  }
  /** Integration cancels the matching HazardSystem owner at the same time. */
  cancel(gameTime = this.clock) {
    validTime(gameTime);
    if (gameTime < this.clock) throw new RangeError('Boss clock cannot run backwards');
    this.clock = gameTime;
    if (this.running) this.readyAt = gameTime + BOSS_NEUTRAL_SECONDS;
    this.running = null;
  }
  reset(gameTime = 0) {
    validTime(gameTime); this.clock = gameTime; this.next = 0; this.readyAt = gameTime;
    this.lastEruptionStart = -Infinity; this.running = null;
    // Keep serial monotonic across reset so stale presentation/events cannot alias a new action.
  }
}

export function bossPatternPhase(action: BossPatternAction, gameTime: number): 'windup' | 'active' | 'recovery' | 'done' {
  return gameTime < action.windupEndsAt ? 'windup' : gameTime < action.activeEndsAt ? 'active' : gameTime < action.endsAt ? 'recovery' : 'done';
}
